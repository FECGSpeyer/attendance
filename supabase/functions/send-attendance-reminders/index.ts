// supabase/functions/send-attendance-reminders/index.ts
// Deploy: supabase functions deploy send-attendance-reminders
// Cron-Trigger in Supabase Dashboard: 0 * * * * (every hour at :00)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

enum AttendanceStatus {
  Neutral = 0,
  Present = 1,
  Excused = 2,
  Late = 3,
  Absent = 4,
  LateExcused = 5,
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
  tenant_id: number;
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

/**
 * Calculate the start hour treating partial hours as the current running hour.
 * Example: 19:30 -> hour 19, 19:00 -> hour 19
 */
function getStartHour(startTimeStr: string): number {
  try {
    const [hourStr, minuteStr] = startTimeStr.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    
    // If any minutes are set, use ceiling; otherwise use the hour as-is
    // But as per requirement: "take the running hour"
    // 19:30 -> running hour is 19, 19:00 -> running hour is 19
    return hour;
  } catch (e) {
    console.error('Error parsing start_time:', startTimeStr, e);
    return 0;
  }
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

    // Get current UTC hour
    const now = new Date();
    const currentUtcHour = now.getUTCHours();

    console.log(`[${now.toISOString()}] Checking for reminders at UTC hour ${currentUtcHour}`);

    // 1. Fetch all attendance types with notification enabled and reminders configured
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

    // 2. For each attendance type, find relevant attendances
    for (const attType of attendanceTypes) {
      const reminders: number[] = attType.reminders || [];
      
      if (reminders.length === 0) continue;

      // Fetch attendances of this type that are future events
      const { data: attendances, error: attError } = await supabase
        .from('attendance')
        .select('id, date, start_time, type_id, tenant_id')
        .eq('type_id', attType.id)
        .gt('start_time', now.toISOString())
        .limit(100);

      if (attError) {
        console.error(`Error fetching attendances for type ${attType.id}:`, attError);
        continue;
      }

      if (!attendances || attendances.length === 0) {
        console.log(`No future attendances for type ${attType.id}`);
        continue;
      }

      // 3. For each attendance, check if it matches a reminder time
      for (const attendance of attendances) {
        const startHour = getStartHour(attendance.start_time);
        
        // Calculate time until attendance start (in hours)
        // Parse the start_time to get the full date/time
        let attendanceStartDate = new Date(attendance.start_time);
        
        // If start_time is only time format (HH:mm), combine with date
        if (!attendance.start_time.includes('T') && !attendance.start_time.includes(' ')) {
          const attendanceDate = new Date(attendance.date);
          const [hour, minute] = attendance.start_time.split(':').map(Number);
          attendanceStartDate = new Date(attendanceDate.getFullYear(), attendanceDate.getMonth(), attendanceDate.getDate(), hour, minute);
        }

        const hoursUntilStart = Math.ceil((attendanceStartDate.getTime() - now.getTime()) / (1000 * 60 * 60));
        
        // Check if this attendance matches any configured reminder
        if (reminders.includes(hoursUntilStart)) {
          console.log(`Match found: Attendance ${attendance.id} (type: ${attType.name}) in ${hoursUntilStart} hours`);

          // 4. Fetch all person_attendance records for this attendance with confirmed status
          const { data: personAttendances, error: paError } = await supabase
            .from('person_attendance')
            .select(`
              id,
              person_id,
              status,
              person:people(firstName, lastName)
            `)
            .eq('attendance_id', attendance.id)
            .not('status', 'is', null);

          if (paError) {
            console.error(`Error fetching person_attendance for ${attendance.id}:`, paError);
            continue;
          }

          if (!personAttendances || personAttendances.length === 0) {
            console.log(`No confirmed attendees for attendance ${attendance.id}`);
            continue;
          }

          // 5. Get all users with notifications enabled and reminders preference
          const { data: notificationConfigs, error: notifError } = await supabase
            .from('notifications')
            .select('id, enabled, telegram_chat_id, reminders, enabled_tenants')
            .eq('enabled', true)
            .eq('reminders', true)
            .not('telegram_chat_id', 'is', null);

          if (notifError) {
            console.error('Error fetching notification configs:', notifError);
            continue;
          }

          if (!notificationConfigs || notificationConfigs.length === 0) {
            console.log('No users with reminders enabled');
            continue;
          }

          // 6. Send reminders to all eligible users who are in person_attendance
          const attendeePersonIds = new Set(
            personAttendances.map((pa: any) => pa.person_id)
          );

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
              hoursUntilStart
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
