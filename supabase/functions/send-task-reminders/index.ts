// supabase/functions/send-task-reminders/index.ts
// Deploy: supabase functions deploy send-task-reminders
// Cron-Trigger in Supabase Dashboard: */5 * * * * (every 5 minutes)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const startedAt = Date.now();
    console.log(`[send-task-reminders] start now=${now.toISOString()}`);

    // Due in exactly 2 days: due_date = today + 2
    const twoDaysFromNow = new Date(now);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const targetDate = twoDaysFromNow.toISOString().split('T')[0];

    // 1. Fetch tasks due in 2 days, not completed, not yet reminded, with responsible person
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, due_date, tenant_id, responsible_person_id')
      .eq('due_date', targetDate)
      .eq('reminder_sent', false)
      .neq('status', 'completed')
      .not('responsible_person_id', 'is', null)
      .range(0, 999);

    if (tasksError) {
      console.error('[send-task-reminders] error fetching tasks:', tasksError);
      throw tasksError;
    }

    if (!tasks || tasks.length === 0) {
      console.log('[send-task-reminders] no tasks due in 2 days');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-task-reminders] found ${tasks.length} tasks due in 2 days`);

    // 2. Get appIds for responsible persons
    const responsibleIds = [...new Set((tasks as Task[]).map(t => t.responsible_person_id!))];
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
    if (appIds.length === 0) {
      console.log('[send-task-reminders] no players with app accounts found');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

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

    const notifMap = new Map<string, NotificationConfig>();
    for (const n of (notifConfigs || [])) {
      // tasks defaults to true if null
      if (n.tasks !== false) {
        notifMap.set(n.id, n);
      }
    }

    let totalReminders = 0;

    // 4. Process each task
    for (const task of (tasks as Task[])) {
      const player = task.responsible_person_id ? playerMap.get(task.responsible_person_id) : null;
      if (!player) continue;

      const notifConfig = notifMap.get(player.appId);
      if (!notifConfig) continue;

      // Check tenant enablement
      const enabledTenants = notifConfig.enabled_tenants || [];
      if (enabledTenants.length > 0 && !enabledTenants.includes(task.tenant_id)) continue;

      const title = '⏰ Aufgabe fällig in 2 Tagen';
      const body = task.title;
      const parallelMode = !!notifConfig.push_and_telegram && !!notifConfig.push_enabled && !!notifConfig.telegram_chat_id;

      let pushSent = 0;
      let telegramSent = false;

      if (notifConfig.push_enabled) {
        try {
          pushSent = await sendPushToUser(supabase, notifConfig.id, {
            title,
            body,
            data: { type: 'task', taskId: task.id, tenantId: String(task.tenant_id) },
          });
          if (pushSent > 0) console.log(`[send-task-reminders] push sent to ${notifConfig.id} for task "${task.title}"`);
        } catch (e) {
          console.error('[send-task-reminders] push error:', e);
        }
      }

      if (notifConfig.telegram_chat_id && (parallelMode || pushSent === 0)) {
        try {
          const formattedDate = new Date(task.due_date).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          });
          const message = `⏰ *Aufgabe fällig in 2 Tagen*\n\n📋 ${task.title}\n📅 Fällig am: ${formattedDate}`;
          const telegramRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: notifConfig.telegram_chat_id, text: message, parse_mode: 'Markdown' }),
          });
          if (telegramRes.ok) {
            telegramSent = true;
            console.log(`[send-task-reminders] telegram sent to ${notifConfig.telegram_chat_id} for task "${task.title}"`);
          } else {
            console.error('[send-task-reminders] telegram error:', await telegramRes.text());
          }
        } catch (e) {
          console.error('[send-task-reminders] telegram error:', e);
        }
      }

      if (pushSent > 0 || telegramSent) {
        totalReminders++;
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
          data: { type: 'task', taskId: task.id, tenantId: String(task.tenant_id) },
        });

        // Mark reminder as sent
        await supabase.from('tasks').update({ reminder_sent: true }).eq('id', task.id);
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
