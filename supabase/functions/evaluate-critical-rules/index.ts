// supabase/functions/evaluate-critical-rules/index.ts
// Deploy: supabase functions deploy evaluate-critical-rules
// Cron-Trigger in Supabase Dashboard: 0 6 * * * (täglich um 6 Uhr)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Enums matching the frontend
enum AttendanceStatus {
  Neutral = 0,
  Present = 1,
  Excused = 2,
  Late = 3,
  Absent = 4,
  LateExcused = 5,
}

enum CriticalRuleThresholdType {
  COUNT = 'count',
  PERCENTAGE = 'percentage',
}

enum CriticalRuleOperator {
  AND = 'AND',
  OR = 'OR',
}

enum CriticalRulePeriodType {
  DAYS = 'days',
  SEASON = 'season',
  ALL_TIME = 'all',
}

interface CriticalRule {
  id: string;
  name?: string;
  attendance_type_ids: string[];
  statuses: AttendanceStatus[];
  threshold_type: CriticalRuleThresholdType;
  threshold_value: number;
  period_type?: CriticalRulePeriodType;
  period_days?: number;
  operator: CriticalRuleOperator;
}

interface Tenant {
  id: number;
  critical_rules: CriticalRule[] | null;
  seasonStart: string | null;
}

interface Player {
  id: number;
  tenantId: number;
  firstName: string | null;
  lastName: string | null;
  isCritical: boolean;
  lastSolve: string | null;
  left: string | null;
}

interface NotificationConfig {
  id: string;
  enabled: boolean;
  telegram_chat_id: string | null;
  criticals: boolean | null;
  enabled_tenants: number[] | null;
}

interface PersonAttendance {
  id: string;
  person_id: number;
  status: AttendanceStatus;
  attendance: {
    id: number;
    date: string;
    type_id: string | null;
  };
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch all tenants with critical_rules
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, critical_rules, seasonStart')
      .not('critical_rules', 'is', null);

    if (tenantsError) throw tenantsError;

    const results: { tenantId: number; playersUpdated: number }[] = [];

    for (const tenant of (tenants as Tenant[]) || []) {
      if (!tenant.critical_rules || tenant.critical_rules.length === 0) continue;

      // 2. Fetch active players for this tenant
      const { data: players, error: playersError } = await supabase
        .from('player')
        .select('id, tenantId, firstName, lastName, isCritical, lastSolve, left')
        .eq('tenantId', tenant.id)
        .is('left', null); // Only active players

      if (playersError) throw playersError;

      // 3. Calculate the date range we need
      // For SEASON or ALL_TIME rules, we need to fetch from seasonStart or all time
      const hasSeasonRule = tenant.critical_rules.some(r => r.period_type === CriticalRulePeriodType.SEASON);
      const hasAllTimeRule = tenant.critical_rules.some(r => r.period_type === CriticalRulePeriodType.ALL_TIME);
      const maxPeriodDays = Math.max(...tenant.critical_rules.map(r => r.period_days || 365));
      
      let startDate: Date;
      if (hasAllTimeRule) {
        // Fetch all attendances (use a very old date)
        startDate = new Date('2000-01-01');
      } else if (hasSeasonRule && tenant.seasonStart) {
        // Use season start or max period, whichever is earlier
        const seasonDate = new Date(tenant.seasonStart);
        const periodDate = new Date();
        periodDate.setDate(periodDate.getDate() - maxPeriodDays);
        startDate = seasonDate < periodDate ? seasonDate : periodDate;
      } else {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - maxPeriodDays);
      }
      const now = new Date();

      // 4. Fetch all person_attendances for this tenant in the period
      // Join with attendance table to get date, type_id and tenantId
      // Only include past attendances (date < now)
      const { data: attendances, error: attError } = await supabase
        .from('person_attendances')
        .select('id, person_id, status, attendance:attendance_id(id, date, type_id, tenantId)')
        .eq('attendance.tenantId', tenant.id)
        .gte('attendance.date', startDate.toISOString())
        .lt('attendance.date', now.toISOString());

      if (attError) throw attError;

      // Group attendances by player
      const attendancesByPlayer = new Map<number, PersonAttendance[]>();
      for (const att of (attendances as PersonAttendance[]) || []) {
        if (!att.attendance) continue; // Skip if no attendance relation
        if (!attendancesByPlayer.has(att.person_id)) {
          attendancesByPlayer.set(att.person_id, []);
        }
        attendancesByPlayer.get(att.person_id)!.push(att);
      }

      let playersUpdated = 0;
      const newCriticalPlayers: Player[] = [];

      // 5. Evaluate rules for each player
      for (const player of (players as Player[]) || []) {
        const playerAttendances = attendancesByPlayer.get(player.id) || [];

        const isCritical = evaluateRules(
          tenant.critical_rules,
          playerAttendances,
          player.lastSolve,
          tenant.seasonStart
        );

        // Only update if status changed
        if (isCritical !== player.isCritical) {
          const { error: updateError } = await supabase
            .from('player')
            .update({ isCritical })
            .eq('id', player.id);

          if (updateError) {
            console.error(`Failed to update player ${player.id}:`, updateError);
          } else {
            playersUpdated++;
            // Track newly critical players for notifications
            if (isCritical) {
              newCriticalPlayers.push(player);
            }
          }
        }
      }

      // 6. Send Telegram notifications for new critical players
      if (newCriticalPlayers.length > 0) {
        await sendCriticalNotifications(supabase, tenant.id, newCriticalPlayers);
      }

      results.push({ tenantId: tenant.id, playersUpdated });
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenantsProcessed: tenants?.length || 0,
        results
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error evaluating critical rules:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Evaluate all rules for a player's attendances
 */
function evaluateRules(
  rules: CriticalRule[],
  attendances: PersonAttendance[],
  lastSolve: string | null,
  seasonStart: string | null
): boolean {
  if (rules.length === 0) return false;

  // Separate AND and OR rules
  const andRules = rules.filter(r => r.operator === CriticalRuleOperator.AND);
  const orRules = rules.filter(r => r.operator === CriticalRuleOperator.OR);

  // Evaluate OR rules: any one matching = critical
  const orResult = orRules.length > 0
    ? orRules.some(rule => evaluateSingleRule(rule, attendances, lastSolve, seasonStart))
    : false;

  // Evaluate AND rules: all must match = critical
  const andResult = andRules.length > 0
    ? andRules.every(rule => evaluateSingleRule(rule, attendances, lastSolve, seasonStart))
    : false;

  // If there are both AND and OR rules, OR takes precedence
  // (any OR match OR all AND matches)
  if (orRules.length > 0 && andRules.length > 0) {
    return orResult || andResult;
  }

  return orResult || andResult;
}

/**
 * Evaluate a single rule against attendances
 */
function evaluateSingleRule(
  rule: CriticalRule,
  attendances: PersonAttendance[],
  lastSolve: string | null,
  seasonStart: string | null
): boolean {
  const now = new Date();
  
  // Determine period start based on period_type
  let periodStart: Date | null = null;
  
  switch (rule.period_type) {
    case CriticalRulePeriodType.DAYS:
      periodStart = new Date();
      periodStart.setDate(now.getDate() - (rule.period_days || 30));
      break;
    case CriticalRulePeriodType.SEASON:
      periodStart = seasonStart ? new Date(seasonStart) : null;
      break;
    case CriticalRulePeriodType.ALL_TIME:
      periodStart = null; // No start date filter
      break;
    default:
      // Legacy rules without period_type - use period_days
      if (rule.period_days) {
        periodStart = new Date();
        periodStart.setDate(now.getDate() - rule.period_days);
      }
  }

  // Use lastSolve as the effective period start if it's after the rule's period start
  const lastSolveDate = lastSolve ? new Date(lastSolve) : null;
  if (lastSolveDate) {
    if (!periodStart || lastSolveDate > periodStart) {
      periodStart = lastSolveDate;
    }
  }

  // Filter attendances by period and attendance type
  const relevantAttendances = attendances.filter(att => {
    const attDate = new Date(att.attendance.date);
    
    // Must be before now
    if (attDate > now) return false;
    
    // Must be after period start (if set)
    if (periodStart && attDate <= periodStart) return false;

    // If specific attendance types are defined, filter by them
    if (rule.attendance_type_ids.length > 0) {
      return rule.attendance_type_ids.includes(att.attendance.type_id || '');
    }

    return true; // All types if none specified
  });

  // Count matching statuses
  const matchingCount = relevantAttendances.filter(att =>
    rule.statuses.includes(att.status)
  ).length;

  const totalCount = relevantAttendances.length;

  if (rule.threshold_type === CriticalRuleThresholdType.COUNT) {
    // e.g., 3 or more absences
    return matchingCount >= rule.threshold_value;
  } else {
    // Percentage: e.g., 20% or more
    if (totalCount === 0) return false;
    const percentage = (matchingCount / totalCount) * 100;
    return percentage >= rule.threshold_value;
  }
}

/**
 * Send Telegram notifications for new critical players
 */
async function sendCriticalNotifications(
  supabase: ReturnType<typeof createClient>,
  tenantId: number,
  newCriticalPlayers: Player[]
): Promise<void> {
  // Role constants matching the frontend
  const ROLE_ADMIN = 1;
  const ROLE_RESPONSIBLE = 5;

  try {
    // Get tenant name for the notification
    const { data: tenant } = await supabase
      .from('tenants')
      .select('longName, shortName')
      .eq('id', tenantId)
      .single();

    const tenantName = tenant?.longName || tenant?.shortName || `Instanz ${tenantId}`;

    // Find users who have ADMIN or RESPONSIBLE role in this tenant
    const { data: tenantUsers, error: tuError } = await supabase
      .from('tenantUsers')
      .select('userId, role')
      .eq('tenantId', tenantId)
      .in('role', [ROLE_ADMIN, ROLE_RESPONSIBLE]);

    if (tuError) {
      console.error('Error fetching tenantUsers:', tuError);
      return;
    }

    const authorizedUserIds = (tenantUsers || []).map(tu => tu.userId);
    if (authorizedUserIds.length === 0) return;

    // Find users who have criticals notifications enabled
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('id, telegram_chat_id, enabled_tenants')
      .eq('enabled', true)
      .eq('criticals', true)
      .not('telegram_chat_id', 'is', null)
      .in('id', authorizedUserIds);

    if (notifError) {
      console.error('Error fetching notifications:', notifError);
      return;
    }

    // Filter users who have this tenant in their enabled_tenants
    const eligibleNotifications = (notifications as NotificationConfig[])?.filter(n => {
      // If enabled_tenants is null or empty, notify for all tenants
      if (!n.enabled_tenants || n.enabled_tenants.length === 0) return true;
      return n.enabled_tenants.includes(tenantId);
    }) || [];

    if (eligibleNotifications.length === 0) return;

    // Build the message
    const playerNames = newCriticalPlayers
      .map(p => `• ${p.firstName || ''} ${p.lastName || ''}`.trim())
      .join('\n');

    const message = `⚠️ *Neue Problemfälle (${tenantName})*\n\n` +
      `${newCriticalPlayers.length} Person(en) wurden als Problemfall markiert:\n\n` +
      `${playerNames}`;

    // Send Telegram messages
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!telegramToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured');
      return;
    }

    for (const notif of eligibleNotifications) {
      if (!notif.telegram_chat_id) continue;

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${telegramToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: notif.telegram_chat_id,
              text: message,
              parse_mode: 'Markdown',
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to send Telegram to ${notif.telegram_chat_id}:`, errorText);
        }
      } catch (err) {
        console.error(`Error sending Telegram to ${notif.telegram_chat_id}:`, err);
      }
    }
  } catch (error) {
    console.error('Error in sendCriticalNotifications:', error);
  }
}
