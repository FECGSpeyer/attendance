// supabase/functions/send-attendance-reminders/index.ts
// Deploy: supabase functions deploy send-attendance-reminders
// Cron-Trigger in Supabase Dashboard: */5 * * * * (every 5 minutes)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_TIMEZONE = 'Europe/Berlin';

enum AttendanceStatus {
  Neutral = 0,
  Present = 1,
  Excused = 2,
  Late = 3,
  Absent = 4,
  LateExcused = 5,
}

interface Tenant {
  id: number;
  timezone: string | null;
}

interface AttendanceType {
  id: string;
  name: string;
  notification?: boolean;
  reminders: number[];
  tenant_id: number;
}

interface Attendance {
  id: number;
  date: string;
  start_time: string;
  type_id: string;
  tenantId: number;
}

interface PersonAttendance {
  id: string;
  person_id: number;
  status: AttendanceStatus | null;
  person: {
    id: number;
    firstName: string | null;
    lastName: string | null;
  };
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  reminders: boolean | null;
  enabled_tenants: number[] | null;
}

interface TenantUser {
  userId: string;
  tenantId: number;
  role: number;
}

// Roles that should receive reminders
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
 * Calculate minutes until a target time, both in the same timezone.
 * All calculations are done in the tenant's local timezone.
 * @param currentLocal - Current time components in local timezone
 * @param targetDateStr - Target date in "YYYY-MM-DD" format
 * @param targetTimeStr - Target time in "HH:mm" format
 * @returns Minutes until target, or negative if target is in the past
 */
function calculateMinutesUntil(
  currentLocal: { year: number; month: number; day: number; hour: number; minute: number },
  targetDateStr: string,
  targetTimeStr: string
): number {
  // Parse target date/time
  const [targetYear, targetMonth, targetDay] = targetDateStr.split('-').map(Number);
  const [targetHour, targetMinute] = (targetTimeStr || '00:00').split(':').map(Number);

  // Create Date objects for comparison (month is 0-indexed in JS Date)
  const currentDate = new Date(currentLocal.year, currentLocal.month - 1, currentLocal.day, currentLocal.hour, currentLocal.minute);
  const targetDate = new Date(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute);

  const diffMs = targetDate.getTime() - currentDate.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * Check if the current time matches a reminder hour within a 5-minute window.
 * This prevents duplicate notifications when the cron job runs every 5 minutes.
 * @param minutesUntilStart - Minutes until the event starts
 * @param reminderHours - Array of reminder hours (e.g., [1, 3, 24])
 * @returns The matched reminder hour, or null if no match
 */
function getMatchingReminder(minutesUntilStart: number, reminderHours: number[]): number | null {
  for (const hours of reminderHours) {
    const targetMinutes = hours * 60;
    // Match if we're within a 5-minute window (0-4 minutes after the exact hour mark)
    // This ensures we only send once per reminder hour
    if (minutesUntilStart >= targetMinutes && minutesUntilStart < targetMinutes + 5) {
      return hours;
    }
  }
  return null;
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

    // Get current UTC time
    const now = new Date();

    console.log(`[${now.toISOString()}] Checking for reminders`);

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

    // 2. Fetch all attendance types with notification enabled and reminders configured
    const { data: attendanceTypes, error: typesError } = await supabase
      .from('attendance_types')
      .select('id, name, notification, reminders, tenant_id')
      .eq('notification', true)
      .not('reminders', 'is', null);

    if (typesError) {
      console.error('Error fetching attendance types:', typesError);
      throw typesError;
    }

    if (!attendanceTypes || attendanceTypes.length === 0) {
      console.log('No attendance types with reminders enabled');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const typeIds = attendanceTypes.map((t: any) => t.id);
    let totalReminders = 0;

    // 3. For each attendance type, find relevant attendances
    for (const attType of attendanceTypes) {
      const reminders: number[] = attType.reminders || [];

      if (reminders.length === 0) continue;

      // Get the timezone for this tenant
      const timezone = tenantTimezones.get(attType.tenant_id) || DEFAULT_TIMEZONE;

      // Fetch attendances of this type that are today or in the future
      // Note: start_time is "HH:mm" format, date is the actual date
      const todayStr = now.toISOString().split('T')[0]; // "YYYY-MM-DD"

      const { data: attendances, error: attError } = await supabase
        .from('attendance')
        .select('id, date, start_time, type_id, tenantId')
        .eq('type_id', attType.id)
        .gte('date', todayStr)
        .limit(100);

      if (attError) {
        console.error(`Error fetching attendances for type ${attType.id}:`, attError);
        continue;
      }

      if (!attendances || attendances.length === 0) {
        console.log(`No future attendances for type ${attType.id}`);
        continue;
      }

      // 4. For each attendance, check if it matches a reminder time
      for (const attendance of attendances) {
        // Get the tenant's timezone for this specific attendance
        const attendanceTimezone = tenantTimezones.get(attendance.tenantId) || timezone;

        // Get current time in the tenant's local timezone
        const currentLocalTime = getCurrentTimeInTimezone(attendanceTimezone);

        // Get attendance date/time (stored in local timezone)
        const dateStr = attendance.date.split('T')[0]; // Ensure we have just the date part
        const timeStr = attendance.start_time || '00:00';

        // Calculate minutes until start in the tenant's local timezone
        const minutesUntilStart = calculateMinutesUntil(currentLocalTime, dateStr, timeStr);

        // Skip if the attendance is in the past
        if (minutesUntilStart <= 0) {
          continue;
        }

        const currentLocalStr = `${currentLocalTime.year}-${String(currentLocalTime.month).padStart(2, '0')}-${String(currentLocalTime.day).padStart(2, '0')} ${String(currentLocalTime.hour).padStart(2, '0')}:${String(currentLocalTime.minute).padStart(2, '0')}`;

        // Check if this attendance matches any configured reminder (within 5-minute window)
        const matchedReminder = getMatchingReminder(minutesUntilStart, reminders);

        if (matchedReminder !== null) {
          console.log(`Attendance ${attendance.id}: ${dateStr} ${timeStr} (${attendanceTimezone}), current local: ${currentLocalStr}, minutes until: ${minutesUntilStart}, matched reminder: ${matchedReminder}h`);

          // 5. Fetch all person_attendances records for this attendance with confirmed status
          const { data: personAttendances, error: paError } = await supabase
            .from('person_attendances')
            .select(`
              id,
              person_id,
              status,
              person:player(firstName, lastName)
            `)
            .eq('attendance_id', attendance.id)
            .not('status', 'is', null);

          if (paError) {
            console.error(`Error fetching person_attendances for ${attendance.id}:`, paError);
            continue;
          }

          if (!personAttendances || personAttendances.length === 0) {
            console.log(`No confirmed attendees for attendance ${attendance.id}`);
            continue;
          }

          // 6. Get all users with role 1 (ADMIN) or 5 (RESPONSIBLE) in this tenant
          const { data: tenantUsers, error: tuError } = await supabase
            .from('tenant_users')
            .select('userId, tenantId, role')
            .eq('tenantId', attType.tenant_id)
            .in('role', REMINDER_ROLES);

          if (tuError) {
            console.error('Error fetching tenant users:', tuError);
            continue;
          }

          if (!tenantUsers || tenantUsers.length === 0) {
            console.log(`No users with ADMIN/RESPONSIBLE role in tenant ${attType.tenant_id}`);
            continue;
          }

          const eligibleUserIds = tenantUsers.map((tu: TenantUser) => tu.userId);

          // 7. Get notification configs for eligible users
          const { data: notificationConfigs, error: notifError } = await supabase
            .from('notifications')
            .select('id, enabled, telegram_chat_id, reminders, enabled_tenants')
            .eq('enabled', true)
            .eq('reminders', true)
            .not('telegram_chat_id', 'is', null)
            .in('id', eligibleUserIds);

          if (notifError) {
            console.error('Error fetching notification configs:', notifError);
            continue;
          }

          if (!notificationConfigs || notificationConfigs.length === 0) {
            console.log('No eligible users with reminders enabled');
            continue;
          }

          // 8. Send reminders to all eligible users
          for (const notifConfig of notificationConfigs) {
            const enabledTenants = notifConfig.enabled_tenants || [];

            // Check if this user has reminders enabled for this tenant
            if (enabledTenants.length > 0 && !enabledTenants.includes(attType.tenant_id)) {
              continue;
            }

            // Send reminder message
            const message = formatReminderMessage(
              attType.name,
              attendance.date,
              attendance.start_time,
              matchedReminder
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
                console.log(`Reminder sent to ${notifConfig.telegram_chat_id} for ${attType.name}`);
              }
            } catch (e) {
              console.error(`Error sending Telegram message:`, e);
            }
          }
        }
      }
    }

    console.log(`Completed. Total reminders sent: ${totalReminders}`);
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
    console.error('Error in send-attendance-reminders:', error);
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
 * Format a reminder message for Telegram
 */
function formatReminderMessage(
  typeName: string,
  date: string,
  startTime: string,
  hoursAhead: number
): string {
  const reminderText = hoursAhead === 0
    ? 'jetzt'
    : hoursAhead === 1
    ? 'in 1 Stunde'
    : hoursAhead < 24
    ? `in ${hoursAhead} Stunden`
    : `in ${Math.floor(hoursAhead / 24)} Tag(en)`;

  // Format date
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Ensure startTime is in HH:mm format
  const timeStr = startTime.includes(':') ? startTime : '00:00';

  return `⏰ *Terminerinnerung*\n\n${reminderText}:\n\n📋 ${typeName}\n📅 ${formattedDate}\n🕐 ${timeStr}`;
}
