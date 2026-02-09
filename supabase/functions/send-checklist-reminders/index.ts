// supabase/functions/send-checklist-reminders/index.ts
// Deploy: supabase functions deploy send-checklist-reminders
// Cron-Trigger in Supabase Dashboard: 0 * * * * (every hour at :00)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_TIMEZONE = 'Europe/Berlin';

interface Tenant {
  id: number;
  timezone: string | null;
}

interface ChecklistItem {
  id: string;
  text: string;
  deadlineHours: number | null;
  completed?: boolean;
  dueDate?: string;
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
  checklist: boolean | null;
  enabled_tenants: number[] | null;
}

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
 * Calculate hours until a target ISO datetime, in the tenant's local timezone.
 * @param currentLocal - Current time components in local timezone
 * @param dueDateIso - Target due date as ISO string
 * @param timezone - The IANA timezone string
 * @returns Hours until target (ceiling), or negative if target is in the past
 */
function calculateHoursUntilDueDate(
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
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes <= 0) {
    return Math.floor(diffMinutes / 60); // Return negative hours for past events
  }

  // Round up to the nearest hour
  return Math.ceil(diffMinutes / 60);
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
    console.log(`[${now.toISOString()}] Checking for checklist reminders`);

    // 1. Fetch all tenants with their timezones
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, timezone');

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      throw tenantsError;
    }

    // Create a map of tenant_id -> timezone
    const tenantTimezones = new Map<number, string>();
    for (const tenant of (tenants || [])) {
      tenantTimezones.set(tenant.id, tenant.timezone || DEFAULT_TIMEZONE);
    }

    // 2. Fetch all attendance types for name lookup
    const { data: attendanceTypes, error: typesError } = await supabase
      .from('attendance_types')
      .select('id, name, tenant_id');

    if (typesError) {
      console.error('Error fetching attendance types:', typesError);
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
      console.error('Error fetching attendances:', attError);
      throw attError;
    }

    if (!attendances || attendances.length === 0) {
      console.log('No attendances with checklists found');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${attendances.length} attendances with checklists`);

    // 4. Get all users with checklist notifications enabled
    const { data: notificationConfigs, error: notifError } = await supabase
      .from('notifications')
      .select('id, enabled, telegram_chat_id, checklist, enabled_tenants')
      .eq('enabled', true)
      .eq('checklist', true)
      .not('telegram_chat_id', 'is', null);

    if (notifError) {
      console.error('Error fetching notification configs:', notifError);
      throw notifError;
    }

    if (!notificationConfigs || notificationConfigs.length === 0) {
      console.log('No users with checklist notifications enabled');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${notificationConfigs.length} users with checklist notifications enabled`);

    let totalReminders = 0;

    // 5. Process each attendance
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

        // Calculate hours until due
        const hoursUntilDue = calculateHoursUntilDueDate(currentLocalTime, item.dueDate, timezone);

        // Send reminder when item is due within the next hour (hoursUntilDue === 1)
        // or when it just became due (hoursUntilDue === 0)
        if (hoursUntilDue === 0 || hoursUntilDue === 1) {
          const currentLocalStr = `${currentLocalTime.year}-${String(currentLocalTime.month).padStart(2, '0')}-${String(currentLocalTime.day).padStart(2, '0')} ${String(currentLocalTime.hour).padStart(2, '0')}:${String(currentLocalTime.minute).padStart(2, '0')}`;
          console.log(`Checklist item due: "${item.text}" for attendance ${attendance.id}, hours until due: ${hoursUntilDue}, current local: ${currentLocalStr}`);

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
              hoursUntilDue
            );

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
                console.log(`Checklist reminder sent to ${notifConfig.telegram_chat_id} for "${item.text}"`);
              }
            } catch (e) {
              console.error(`Error sending Telegram message:`, e);
            }
          }
        }
      }
    }

    console.log(`Completed. Total checklist reminders sent: ${totalReminders}`);
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
    console.error('Error in send-checklist-reminders:', error);
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
  hoursUntilDue: number
): string {
  const urgencyText = hoursUntilDue === 0
    ? '⚠️ *Jetzt fällig!*'
    : '⏰ *In 1 Stunde fällig*';

  // Format attendance date
  const attDateObj = new Date(attendanceDate);
  const formattedAttDate = attDateObj.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const formattedDueDate = formatDueDate(dueDate, timezone);

  return `${urgencyText}\n\n📋 *Checklisten-Erinnerung*\n\n✅ ${itemText}\n📅 Termin: ${typeName} am ${formattedAttDate}\n⏳ Fällig: ${formattedDueDate}`;
}
