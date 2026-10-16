import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { Plan } from './interfaces';
import { allPlans, dayOptions, nextFreeDay, planLabel, planSubtitle, splitPlans, todayPlanIndex } from './plan-days';

const plan = (extra: Partial<Plan> = {}): Plan => ({ time: '08:00', end: '', fields: [], ...extra });

describe('plan-days', () => {
  const freizeit = {
    date: '2026-10-17',
    duration_days: 3,
    plan: plan(),
    extra_plans: [plan({ day: 1 }), plan({ day: 2 })],
  };

  it('lists the first plan followed by the extra plans', () => {
    expect(allPlans(freizeit)).toHaveLength(3);
    expect(allPlans({ date: '2026-10-17', plan: undefined })).toEqual([]);
  });

  it('names plans of a multi-day Termin after their day', () => {
    expect(planLabel(freizeit, 0)).toBe('Sa 17.10.');
    expect(planLabel(freizeit, 2)).toBe('Mo 19.10.');
  });

  it('names plans of a one-day Termin by number and prefers custom labels', () => {
    const konzert = { date: '2026-10-17', plan: plan(), extra_plans: [plan({ label: 'Konzert' }), plan()] };
    expect(planLabel(konzert, 0)).toBe('Plan 1');
    expect(planLabel(konzert, 1)).toBe('Konzert');
    expect(planLabel(konzert, 2)).toBe('Plan 3');
    expect(planSubtitle(konzert, 1)).toBe('Samstag, 17.10.2026 · Konzert');
  });

  it('picks today\'s plan and falls back to the first', () => {
    expect(todayPlanIndex(freizeit, dayjs('2026-10-18T10:00'))).toBe(1);
    expect(todayPlanIndex(freizeit, dayjs('2026-11-01T10:00'))).toBe(0);
  });

  it('finds the next free day', () => {
    const twoOfThree = { ...freizeit, extra_plans: [plan({ day: 2 })] };
    expect(nextFreeDay(twoOfThree, allPlans(twoOfThree))).toBe(1);
    expect(nextFreeDay(freizeit, allPlans(freizeit))).toBeUndefined();
    expect(dayOptions({ date: '2026-10-17', duration_days: 1 })).toEqual([]);
  });

  it('splits plans back into the attendance columns', () => {
    const plans = [plan({ title: 'a' }), plan({ title: 'b' })];
    expect(splitPlans(plans)).toEqual({ plan: plans[0], extra_plans: [plans[1]] });
    expect(splitPlans([plans[0]])).toEqual({ plan: plans[0], extra_plans: null });
  });
});
