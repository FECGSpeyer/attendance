// supabase/functions/send-checklist-reminders/index.ts
// Deploy: supabase functions deploy send-checklist-reminders
// Cron-Trigger in Supabase Dashboard: */5 * * * * (every 5 minutes)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToUser } from '../_shared/send-push.ts'

const DEFAULT_TIMEZONE = 'Europe/Berlin';

interface Tenant {
  id: number;
  timezone: string | null;
  longName: string | null;
  shortName: string | null;
}

interface ChecklistItem {
  id: string;
  text: string;
  deadlineHours: number | null;
  completed?: boolean;
  dueDate?: string;
  remindersSent?: string[]; // Track which reminders have been sent (e.g., ['1h', '0h'])
}

interface Attendance {
  id: number;
  date: string;
  start_time: string;
  type_id: string;
  tenantId: number;
  checklist: ChecklistItem[] | null;
}

interface AttendanceType {
  id: string;
  name: string;
  tenant_id: number;
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  push_enabled: boolean | null;
  checklist: boolean | null;
  enabled_tenants: number[] | null;
}

interface TenantUser {
  userId: string;
  tenantId: number;
  role: number;
}

// Roles that should receive checklist reminders
const REMINDER_ROLES = [1, 5]; // ADMIN = 1, RESPONSIBLE = 5

/**
 * Get the current local time in a specific timezone.
 * @param timezone - The IANA timezone string (e.g., "Europe/Berlin")
 * @returns An object with year, month, day, hour, minute in the local timezone
 */
function getCurrentTimeInTimezone(timezone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
  };
}

/**
 * Calculate minutes until a target ISO datetime, in the tenant's local timezone.
 * @param currentLocal - Current time components in local timezone
 * @param dueDateIso - Target due date as ISO string
 * @param timezone - The IANA timezone string
 * @returns Minutes until target, or negative if target is in the past
 */
function calculateMinutesUntilDueDate(
  currentLocal: { year: number; month: number; day: number; hour: number; minute: number },
  dueDateIso: string,
  timezone: string
): number {
  // Parse the due date ISO string and convert to local timezone
  const dueDate = new Date(dueDateIso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(dueDate);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const dueLocal = {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
  };

  // Create Date objects for comparison (month is 0-indexed in JS Date)
  const currentDate = new Date(currentLocal.year, currentLocal.month - 1, currentLocal.day, currentLocal.hour, currentLocal.minute);
  const targetDate = new Date(dueLocal.year, dueLocal.month - 1, dueLocal.day, dueLocal.hour, dueLocal.minute);

  const diffMs = targetDate.getTime() - currentDate.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * Format a due date for display
 */
function formatDueDate(dueDateIso: string, timezone: string): string {
  const dueDate = new Date(dueDateIso);
  return dueDate.toLocaleString('de-DE', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

Deno.serve(async (req) => {
  try {
    // Verify this is a cron job or authorized request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader && req.method !== 'POST') {
      return new Response('Unauthorized', { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const startedAt = Date.now();
    console.log(`[send-checklist-reminders] start now=${now.toISOString()}`);

    // 1. Fetch all tenants with their timezones
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, timezone, longName, shortName');

    if (tenantsError) {
      console.error('[send-checklist-reminders] error fetching tenants:', tenantsError);
      throw tenantsError;
    }

    // Create a map of tenant_id -> timezone
    const tenantTimezones = new Map<number, string>();
    // Create a map of tenant_id -> display name
    const tenantNames = new Map<number, string>();
    for (const tenant of (tenants || [])) {
      tenantTimezones.set(tenant.id, tenant.timezone || DEFAULT_TIMEZONE);
      tenantNames.set(tenant.id, tenant.longName || tenant.shortName || '');
    }
    console.log(`[send-checklist-reminders] tenants=${tenants?.length ?? 0}`);

    // 2. Fetch all attendance types for name lookup
    const { data: attendanceTypes, error: typesError } = await supabase
      .from('attendance_types')
      .select('id, name, tenant_id');

    if (typesError) {
      console.error('[send-checklist-reminders] error fetching attendance types:', typesError);
      throw typesError;
    }

    const typeMap = new Map<string, AttendanceType>();
    for (const type of (attendanceTypes || [])) {
      typeMap.set(type.id, type);
    }

    // 3. Fetch all attendances with checklists (today or future)
    const todayStr = now.toISOString().split('T')[0];

    const { data: attendances, error: attError } = await supabase
      .from('attendance')
      .select('id, date, start_time, type_id, tenantId, checklist')
      .gte('date', todayStr)
      .not('checklist', 'is', null)
      .limit(500);

    if (attError) {
      console.error('[send-checklist-reminders] error fetching attendances:', attError);
      throw attError;
    }

    if (!attendances || attendances.length === 0) {
      console.log('[send-checklist-reminders] no attendances with checklists found');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (attendances.length >= 500) {
      console.warn('[send-checklist-reminders] attendance fetch hit the .limit(500) cap; some checklists may be unprocessed');
    }

    console.log(`[send-checklist-reminders] found ${attendances.length} attendances with checklists`);

    // 4. Get all tenant_users with role ADMIN (1) or RESPONSIBLE (5) grouped by tenant.
    // Scope to only the tenants that actually have qualifying attendances and
    // bound the result set so PostgREST's default 1000-row cap can't truncate
    // large tenants' admin lists.
    const tenantIdsWithChecklists = [...new Set(attendances.map(a => a.tenantId))];
    const { data: allTenantUsers, error: tuError } = await supabase
      .from('tenantUsers')
      .select('userId, tenantId, role')
      .in('role', REMINDER_ROLES)
      .in('tenantId', tenantIdsWithChecklists)
      .range(0, 4999);

    if (tuError) {
      console.error('[send-checklist-reminders] error fetching tenant users:', tuError);
      throw tuError;
    }

    if ((allTenantUsers?.length ?? 0) >= 4900) {
      console.warn(`[send-checklist-reminders] tenantUsers count=${allTenantUsers?.length} approaching the 5000-row range cap`);
    }

    // Create a map of tenantId -> eligible userIds
    const tenantEligibleUsers = new Map<number, string[]>();
    for (const tu of (allTenantUsers || [])) {
      const users = tenantEligibleUsers.get(tu.tenantId) || [];
      users.push(tu.userId);
      tenantEligibleUsers.set(tu.tenantId, users);
    }
    console.log(`[send-checklist-reminders] tenantsWithChecklists=${tenantIdsWithChecklists.length} eligibleTenantUserRows=${allTenantUsers?.length ?? 0}`);

    // 5. Get all users with checklist notifications enabled.
    // notifications has no tenantId column (per-user with `enabled_tenants`
    // jsonb), so the most we can do beyond enabled+checklist filters is bound
    // the page size against PostgREST's 1000-row default.
    const { data: allNotificationConfigs, error: notifError } = await supabase
      .from('notifications')
      .select('id, enabled, telegram_chat_id, push_enabled, checklist, enabled_tenants')
      .eq('enabled', true)
      .eq('checklist', true)
      .range(0, 4999);

    if (notifError) {
      console.error('[send-checklist-reminders] error fetching notification configs:', notifError);
      throw notifError;
    }

    if ((allNotificationConfigs?.length ?? 0) >= 4900) {
      console.warn(`[send-checklist-reminders] notifications count=${allNotificationConfigs?.length} approaching the 5000-row range cap`);
    }

    // Filter to users who have at least one channel configured
    const filteredConfigs = (allNotificationConfigs || []).filter(
      (nc: NotificationConfig) => nc.telegram_chat_id || nc.push_enabled
    );

    if (!filteredConfigs || filteredConfigs.length === 0) {
      console.log('[send-checklist-reminders] no users with checklist notifications enabled');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-checklist-reminders] users with checklist notifications enabled=${filteredConfigs.length}`);

    let totalReminders = 0;

    // 6. Process each attendance
    for (const attendance of attendances) {
      const checklist = attendance.checklist as ChecklistItem[] | null;
      if (!checklist || checklist.length === 0) continue;

      const timezone = tenantTimezones.get(attendance.tenantId) || DEFAULT_TIMEZONE;
      const currentLocalTime = getCurrentTimeInTimezone(timezone);
      const attType = typeMap.get(attendance.type_id);

      // Process each checklist item
      for (const item of checklist) {
        // Skip completed items or items without due date
        if (item.completed || !item.dueDate) continue;

        // Calculate minutes until due
        const minutesUntilDue = calculateMinutesUntilDueDate(currentLocalTime, item.dueDate, timezone);

        // Send reminder when item is due within 0-10 minutes (just due)
        // or within 55-70 minutes (1 hour before)
        // Extended windows ensure reminders aren't missed due to cron timing
        const isJustDue = minutesUntilDue >= 0 && minutesUntilDue < 10;
        const isOneHourBefore = minutesUntilDue >= 55 && minutesUntilDue < 70;

        // Determine which reminder type we should send
        let reminderType: '0h' | '1h' | null = null;
        if (isJustDue) {
          reminderType = '0h';
        } else if (isOneHourBefore) {
          reminderType = '1h';
        }

        // Check if we already sent this reminder type for this item
        const remindersSent = item.remindersSent || [];
        if (reminderType && !remindersSent.includes(reminderType)) {
          const hoursUntilDue = reminderType === '0h' ? 0 : 1;
          const currentLocalStr = `${currentLocalTime.year}-${String(currentLocalTime.month).padStart(2, '0')}-${String(currentLocalTime.day).padStart(2, '0')} ${String(currentLocalTime.hour).padStart(2, '0')}:${String(currentLocalTime.minute).padStart(2, '0')}`;
          console.log(`Checklist item due: "${item.text}" for attendance ${attendance.id}, minutes until due: ${minutesUntilDue}, current local: ${currentLocalStr}`);

          // Get eligible users for this tenant (role 1 or 5)
          const eligibleUserIds = tenantEligibleUsers.get(attendance.tenantId) || [];
          const notificationConfigs = filteredConfigs.filter(
            (nc: NotificationConfig) => eligibleUserIds.includes(nc.id)
          );

          // Send to all eligible users
          for (const notifConfig of notificationConfigs) {
            const enabledTenants = notifConfig.enabled_tenants || [];

            // Check if this user has notifications enabled for this tenant
            if (enabledTenants.length > 0 && !enabledTenants.includes(attendance.tenantId)) {
              continue;
            }

            // Format the message
            const message = formatChecklistReminderMessage(
              item.text,
              item.dueDate,
              attendance.date,
              attType?.name || 'Termin',
              timezone,
              hoursUntilDue,
              attendance.id,
              attendance.tenantId,
              tenantNames.get(attendance.tenantId) || ''
            );

            let pushSentSuccessfully = false;

            // Send via Push (preferred channel)
            if (notifConfig.push_enabled) {
              try {
                const pushTitle = hoursUntilDue === 0 ? '⚠️ Jetzt fällig!' : '⏰ Demnächst fällig';
                const tenantName = tenantNames.get(attendance.tenantId) || '';
                const pushBody = tenantName
                  ? `${tenantName}: ${item.text} (${attType?.name || 'Termin'})`
                  : `${item.text} (${attType?.name || 'Termin'})`;
                const pushSent = await sendPushToUser(supabase, notifConfig.id, {
                  title: pushTitle,
                  body: pushBody,
                  data: { type: 'checklist', attendanceId: String(attendance.id), tenantId: String(attendance.tenantId) },
                });
                if (pushSent > 0) {
                  totalReminders++;
                  pushSentSuccessfully = true;
                  console.log(`Checklist reminder sent via Push to ${notifConfig.id} for "${item.text}"`);
                }
              } catch (e) {
                console.error(`Error sending push notification:`, e);
              }
            }

            // Send via Telegram only if push was not sent
            if (notifConfig.telegram_chat_id && !pushSentSuccessfully) {
              try {
                const telegramRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: notifConfig.telegram_chat_id,
                    text: message,
                    parse_mode: 'Markdown',
                  }),
                });

                if (!telegramRes.ok) {
                  console.error(`Failed to send Telegram message to ${notifConfig.telegram_chat_id}:`, await telegramRes.text());
                } else {
                  totalReminders++;
                  console.log(`Checklist reminder sent via Telegram to ${notifConfig.telegram_chat_id} for "${item.text}"`);
                }
              } catch (e) {
                console.error(`Error sending Telegram message:`, e);
              }
            }
          }

          // Mark this reminder as sent by updating the checklist in the database
          item.remindersSent = [...remindersSent, reminderType];

          // Update the attendance checklist in the database
          try {
            const { error: updateError } = await supabase
              .from('attendance')
              .update({ checklist: checklist })
              .eq('id', attendance.id);

            if (updateError) {
              console.error(`Failed to update checklist for attendance ${attendance.id}:`, updateError);
            }
          } catch (e) {
            console.error(`Error updating checklist:`, e);
          }
        }
      }
    }

    console.log(`[send-checklist-reminders] done totalReminders=${totalReminders} elapsedMs=${Date.now() - startedAt}`);
    return new Response(
      JSON.stringify({
        success: true,
        processed: totalReminders,
        timestamp: now.toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[send-checklist-reminders] fatal:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Format a checklist reminder message for Telegram
 */
function formatChecklistReminderMessage(
  itemText: string,
  dueDate: string,
  attendanceDate: string,
  typeName: string,
  timezone: string,
  hoursUntilDue: number,
  attendanceId: number,
  tenantId: number,
  tenantName: string
): string {
  const urgencyText = hoursUntilDue === 0
    ? '⚠️ *Jetzt fällig!*'
    : '⏰ *Demnächst fällig*';

  // Format attendance date
  const attDateObj = new Date(attendanceDate);
  const formattedAttDate = attDateObj.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const formattedDueDate = formatDueDate(dueDate, timezone);

  const link = `\n\n[Anwesenheit öffnen](https://attendix.de/open-attendance?id=${attendanceId}&tenantId=${tenantId})`;

  const tenantLine = tenantName ? `\n🏛️ ${tenantName}` : '';

  return `${urgencyText}\n\n📋 *Checklisten-Erinnerung*${tenantLine}\n\n✅ ${itemText}\n📅 Termin: ${typeName} am ${formattedAttDate}\n⏳ Fällig: ${formattedDueDate}${link}`;
}
