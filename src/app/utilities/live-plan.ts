import { Attendance, Plan } from './interfaces';
import { allPlans, hasMultiplePlans, planDay, planLabel } from './plan-days';
import { buildSchedule, LivePlanItem } from '../../../supabase/functions/_shared/live-plan-state';

export * from '../../../supabase/functions/_shared/live-plan-state';

type LiveAttendance = Pick<Partial<Attendance>, 'id' | 'date' | 'plan' | 'extra_plans' | 'duration_days' | 'typeInfo'>;

/** Key of a plan within its Termin; plan 1 has no id. Must match the Edge Function. */
export function livePlanKey(plan: Plan | null | undefined): string {
  return plan?.id || 'main';
}

/** Header of the Live Activity: Termin name, plus the plan's label when the Termin has several plans. */
export function liveTitle(att: LiveAttendance, typeName: string, index: number, plans: Plan[] = allPlans(att)): string {
  const name = att.typeInfo?.trim() || typeName || 'Termin';
  return hasMultiplePlans(att) ? `${name} · ${planLabel(att, index, plans)}` : name;
}

/** Schedule of one plan of a Termin. */
export function liveSchedule(att: LiveAttendance, index: number, timezone: string, plans: Plan[] = allPlans(att)): LivePlanItem[] {
  const plan = plans[index];
  if (!att.date || !plan?.time || !plan.fields?.length) { return []; }
  return buildSchedule({
    date: att.date,
    planTime: plan.time,
    dayOffset: planDay(att, plans, index) ?? 0,
    fields: plan.fields,
    timezone,
  });
}
