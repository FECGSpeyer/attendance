import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { Attendance, Plan } from './interfaces';

/**
 * Helpers for Termine with more than one Ablaufplan (e.g. one per day of a
 * Freizeit). `attendance.plan` always stays the first plan, so everything that
 * only knows about `plan` keeps working and simply shows plan 1; the further
 * plans live in `attendance.extra_plans`.
 */
export type PlanSource = Pick<Partial<Attendance>, 'plan' | 'extra_plans' | 'date' | 'duration_days'>;

export function allPlans(att: PlanSource | null | undefined): Plan[] {
  if (!att?.plan) { return []; }
  return [att.plan, ...(att.extra_plans ?? []).filter(Boolean)];
}

export function hasMultiplePlans(att: PlanSource | null | undefined): boolean {
  return allPlans(att).length > 1;
}

export function isMultiDay(att: PlanSource | null | undefined): boolean {
  return (Number(att?.duration_days) || 1) > 1;
}

/** Termin or Anwesenheit of a person (duration then lives in `attendance`). */
export type DurationSource = {
  date?: string;
  duration_days?: number;
  attendance?: { duration_days?: number } | null;
};

/** Last day of a Termin; multi-day Termine end `duration_days - 1` days after their start. */
export function attendanceEndDate(att: DurationSource): dayjs.Dayjs {
  const days = Number(att?.duration_days ?? att?.attendance?.duration_days) || 1;
  return dayjs(att?.date).add(Math.max(days, 1) - 1, 'day');
}

/** A Termin is past only once its last day is over, so a running Freizeit stays current. */
export function attendanceHasEnded(att: DurationSource, ref: dayjs.ConfigType = dayjs()): boolean {
  return attendanceEndDate(att).isBefore(dayjs(ref), 'day');
}

/** Termin starts today or is still running today. */
export function attendanceIsRunning(att: DurationSource, ref: dayjs.ConfigType = dayjs()): boolean {
  return !dayjs(att?.date).isAfter(dayjs(ref), 'day') && !attendanceHasEnded(att, ref);
}

/** Day (0-based) a plan belongs to; the first plan of a multi-day Termin defaults to day 0. */
export function planDay(att: PlanSource, plans: Plan[], index: number): number | undefined {
  const plan = plans[index];
  if (plan?.day !== undefined && plan?.day !== null) { return Number(plan.day); }
  if (index === 0 && isMultiDay(att)) { return 0; }
  return undefined;
}

export function dayLabel(att: PlanSource, day: number): string {
  return dayjs(att.date).add(day, 'day').locale('de').format('dd DD.MM.');
}

/** Name shown on a plan chip: custom label, else the day ("Sa 18.10."), else "Plan n". */
export function planLabel(att: PlanSource, index: number, plans: Plan[] = allPlans(att)): string {
  const custom = plans[index]?.label?.trim();
  if (custom) { return custom; }
  const day = planDay(att, plans, index);
  if (day !== undefined && isMultiDay(att)) { return dayLabel(att, day); }
  return `Plan ${index + 1}`;
}

/** Calendar date of a plan (Termin date plus its day offset). */
export function planDate(att: PlanSource, index: number, plans: Plan[] = allPlans(att)): dayjs.Dayjs {
  return dayjs(att.date).add(planDay(att, plans, index) ?? 0, 'day');
}

/** Subtitle for PDF exports: the plan's date, plus its name when the date alone doesn't tell plans apart. */
export function planSubtitle(att: PlanSource, index: number, plans: Plan[] = allPlans(att)): string {
  const date = planDate(att, index, plans).locale('de').format('dddd, DD.MM.YYYY');
  if (plans.length < 2) { return date; }
  const hasDay = planDay(att, plans, index) !== undefined && isMultiDay(att);
  const custom = plans[index]?.label?.trim();
  if (hasDay && !custom) { return date; }
  return `${date} · ${planLabel(att, index, plans)}`;
}

/** Index of the plan for today, falling back to the first plan. */
export function todayPlanIndex(att: PlanSource | null | undefined, now: dayjs.Dayjs = dayjs()): number {
  const plans = allPlans(att);
  if (plans.length < 2 || !att) { return 0; }
  const idx = plans.findIndex((_, i) => planDay(att, plans, i) !== undefined && planDate(att, i, plans).isSame(now, 'day'));
  return idx >= 0 ? idx : 0;
}

/** The days of a multi-day Termin, for "Anderem Tag zuordnen". */
export function dayOptions(att: PlanSource): { day: number; label: string }[] {
  if (!isMultiDay(att)) { return []; }
  const count = Number(att.duration_days) || 1;
  return Array.from({ length: count }, (_, day) => ({ day, label: dayLabel(att, day) }));
}

/** First day of a multi-day Termin that has no plan yet. */
export function nextFreeDay(att: PlanSource, plans: Plan[]): number | undefined {
  const used = new Set(plans.map((_, i) => planDay(att, plans, i)).filter(d => d !== undefined));
  return dayOptions(att).find(o => !used.has(o.day))?.day;
}

/** Splits a full plan list back into the two attendance columns. */
export function splitPlans(plans: Plan[]): { plan: Plan | null; extra_plans: Plan[] | null } {
  return {
    plan: plans[0] ?? null,
    extra_plans: plans.length > 1 ? plans.slice(1) : null,
  };
}
