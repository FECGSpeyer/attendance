/**
 * "Unveröffentlicht" (Gemeinde App, FECG Speyer and FECG Schwegenheim): a plan with
 * `unpublished: true` is only shown in the editor. Viewers, public links, iCal, the
 * dashboard and the Live Activity skip it until it is published in the Gemeinde App.
 * The same rule lives in supabase/functions (ical-org-plans, live-activity-tick).
 */
export function isPlanPublished(plan: { unpublished?: boolean | null } | null | undefined): boolean {
  return !!plan && plan.unpublished !== true;
}

/** JSON with sorted keys, so a plan read back from the database compares equal to the one saved. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o: Record<string, unknown>, k) => { o[k] = v[k]; return o; }, {})
    : v));
}
