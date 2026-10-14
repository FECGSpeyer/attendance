// supabase/functions/send-task-reminders/index.ts
// Deploy: supabase functions deploy send-task-reminders
// Cron-Trigger in Supabase Dashboard: */5 * * * * (every 5 minutes)
//
// Sends two one-time reminders to the responsible person of a task:
//  - 2 days before the due date (reminder_sent)
//  - once the task is overdue (overdue_reminder_sent)
// Changing the due date resets both flags (DB trigger tasks_set_completed_at).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToUser } from '../_shared/send-push.ts'
import { logNotification } from '../_shared/log-notification.ts'

interface Task {
  id: string;
  title: string;
  due_date: string;
  tenant_id: number;
  responsible_person_id: number | null;
}

interface Player {
  id: number;
  appId: string;
  tenantId: number;
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  push_enabled: boolean | null;
  telegram_chat_id: string | null;
  push_and_telegram: boolean | null;
  tasks: boolean | null;
  enabled_tenants: number[] | null;
}

type ReminderKind = 'due_soon' | 'overdue';

const REMINDER_TEXT: Record<ReminderKind, { title: string; flag: 'reminder_sent' | 'overdue_reminder_sent' }> = {
  due_soon: { title: '⏰ Aufgabe fällig in 2 Tagen', flag: 'reminder_sent' },
  overdue: { title: '⚠️ Aufgabe überfällig', flag: 'overdue_reminder_sent' },
};

function formatDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : isoDate;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const startedAt = Date.now();
    console.log(`[send-task-reminders] start now=${now.toISOString()}`);

    const today = now.toISOString().split('T')[0];
    // Due in exactly 2 days: due_date = today + 2
    const twoDaysFromNow = new Date(now);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const targetDate = twoDaysFromNow.toISOString().split('T')[0];

    // 1a. Tasks due in 2 days, not completed, not yet reminded, with responsible person
    const { data: dueTasks, error: dueError } = await supabase
      .from('tasks')
      .select('id, title, due_date, tenant_id, responsible_person_id')
      .eq('due_date', targetDate)
      .eq('reminder_sent', false)
      .neq('status', 'completed')
      .not('responsible_person_id', 'is', null)
      .range(0, 999);

    if (dueError) {
      console.error('[send-task-reminders] error fetching tasks:', dueError);
      throw dueError;
    }

    // 1b. Overdue tasks (due before today), not completed, not yet reminded about being overdue
    const { data: overdueTasks, error: overdueError } = await supabase
      .from('tasks')
      .select('id, title, due_date, tenant_id, responsible_person_id')
      .lt('due_date', today)
      .eq('overdue_reminder_sent', false)
      .neq('status', 'completed')
      .not('responsible_person_id', 'is', null)
      .range(0, 999);

    if (overdueError) {
      console.error('[send-task-reminders] error fetching overdue tasks:', overdueError);
      throw overdueError;
    }

    const jobs: { task: Task; kind: ReminderKind }[] = [
      ...((dueTasks || []) as Task[]).map(task => ({ task, kind: 'due_soon' as const })),
      ...((overdueTasks || []) as Task[]).map(task => ({ task, kind: 'overdue' as const })),
    ];

    if (jobs.length === 0) {
      console.log('[send-task-reminders] no tasks to remind');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-task-reminders] found ${dueTasks?.length ?? 0} tasks due in 2 days, ${overdueTasks?.length ?? 0} overdue`);

    // 2. Get appIds for responsible persons
    const responsibleIds = [...new Set(jobs.map(j => j.task.responsible_person_id!))];
    const { data: players, error: playersError } = await supabase
      .from('player')
      .select('id, appId, tenantId')
      .in('id', responsibleIds)
      .not('appId', 'is', null)
      .is('left', null);

    if (playersError) {
      console.error('[send-task-reminders] error fetching players:', playersError);
      throw playersError;
    }

    const playerMap = new Map<number, Player>();
    for (const p of (players || [])) {
      playerMap.set(p.id, p);
    }

    // 3. Get notification configs for responsible persons' appIds
    const appIds = (players || []).map((p: Player) => p.appId);
    const notifMap = new Map<string, NotificationConfig>();
    if (appIds.length > 0) {
      const { data: notifConfigs, error: notifError } = await supabase
        .from('notifications')
        .select('id, enabled, push_enabled, telegram_chat_id, push_and_telegram, tasks, enabled_tenants')
        .eq('enabled', true)
        .in('id', appIds)
        .range(0, 4999);

      if (notifError) {
        console.error('[send-task-reminders] error fetching notifications:', notifError);
        throw notifError;
      }

      for (const n of (notifConfigs || [])) {
        // tasks defaults to true if null
        if (n.tasks !== false) {
          notifMap.set(n.id, n);
        }
      }
    }

    let totalReminders = 0;

    // 4. Process each task
    for (const { task, kind } of jobs) {
      const sent = await sendReminder(supabase, telegramBotToken, task, kind, playerMap, notifMap);
      if (sent) totalReminders++;
      // One-time reminder: mark it handled, also when nobody can be reached
      // (otherwise overdue tasks would be checked again every 5 minutes forever).
      if (sent || kind === 'overdue') {
        await supabase.from('tasks').update({ [REMINDER_TEXT[kind].flag]: true }).eq('id', task.id);
      }
    }

    console.log(`[send-task-reminders] done totalReminders=${totalReminders} elapsedMs=${Date.now() - startedAt}`);
    return new Response(
      JSON.stringify({ success: true, processed: totalReminders, timestamp: now.toISOString() }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-task-reminders] fatal:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function sendReminder(
  supabase: SupabaseClient,
  telegramBotToken: string,
  task: Task,
  kind: ReminderKind,
  playerMap: Map<number, Player>,
  notifMap: Map<string, NotificationConfig>,
): Promise<boolean> {
  const player = task.responsible_person_id ? playerMap.get(task.responsible_person_id) : null;
  if (!player) return false;

  const notifConfig = notifMap.get(player.appId);
  if (!notifConfig) return false;

  // Check tenant enablement
  const enabledTenants = (notifConfig.enabled_tenants || []).map(Number);
  if (enabledTenants.length > 0 && !enabledTenants.includes(Number(task.tenant_id))) return false;

  const title = REMINDER_TEXT[kind].title;
  const formattedDate = formatDate(task.due_date);
  const body = kind === 'overdue' ? `${task.title} (fällig seit ${formattedDate})` : task.title;
  const route = `/tabs/settings/tasks/${task.id}`;
  const data = { type: 'task', taskId: task.id, tenantId: String(task.tenant_id), route };
  const parallelMode = !!notifConfig.push_and_telegram && !!notifConfig.push_enabled && !!notifConfig.telegram_chat_id;

  let pushSent = 0;
  let telegramSent = false;

  if (notifConfig.push_enabled) {
    try {
      pushSent = await sendPushToUser(supabase, notifConfig.id, { title, body, data });
      if (pushSent > 0) console.log(`[send-task-reminders] push (${kind}) sent to ${notifConfig.id} for task "${task.title}"`);
    } catch (e) {
      console.error('[send-task-reminders] push error:', e);
    }
  }

  if (notifConfig.telegram_chat_id && (parallelMode || pushSent === 0)) {
    try {
      const message = kind === 'overdue'
        ? `⚠️ Aufgabe überfällig\n\n📋 ${task.title}\n📅 Fällig seit: ${formattedDate}\n\nIn der App öffnen: https://attendix.de${route}`
        : `⏰ Aufgabe fällig in 2 Tagen\n\n📋 ${task.title}\n📅 Fällig am: ${formattedDate}\n\nIn der App öffnen: https://attendix.de${route}`;
      const telegramRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: notifConfig.telegram_chat_id, text: message, disable_web_page_preview: true }),
      });
      if (telegramRes.ok) {
        telegramSent = true;
        console.log(`[send-task-reminders] telegram (${kind}) sent to ${notifConfig.telegram_chat_id} for task "${task.title}"`);
      } else {
        console.error('[send-task-reminders] telegram error:', await telegramRes.text());
      }
    } catch (e) {
      console.error('[send-task-reminders] telegram error:', e);
    }
  }

  if (pushSent === 0 && !telegramSent) return false;

  const channels: string[] = [];
  if (pushSent > 0) channels.push('push');
  if (telegramSent) channels.push('telegram');
  await logNotification(supabase, {
    userId: notifConfig.id,
    tenantId: task.tenant_id,
    type: 'task',
    title,
    body,
    channels,
    data,
  });
  return true;
}
