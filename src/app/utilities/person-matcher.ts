/**
 * Person Matcher
 *
 * Utility for matching people across linked tenants when adding or editing
 * a person record. Returns ranked, scored matches with a short German reason
 * label so the UI can surface them as typeahead suggestions.
 *
 * Pure functions only — no Angular DI, no Supabase. Easy to unit-test.
 *
 * - Diacritic-insensitive (`Müller` ↔ `Mueller` ↔ `Muller`)
 * - Tolerates typos via Levenshtein edit distance
 * - Prefix-friendly so partial input ranks well during typing
 * - Detects swapped first/last name pairs
 */

export interface PersonLike {
  firstName: string;
  lastName: string;
  email?: string | null;
  appId?: string | null;
}

export interface RankedMatch<T extends PersonLike = PersonLike> {
  candidate: T;
  /** 0..1 — higher is better */
  score: number;
  /** Short German label for the UI */
  reason: string;
}

export interface RankOptions {
  /** Discard candidates below this score. Default 0.55 */
  threshold?: number;
  /** Cap returned matches. Default 10 */
  limit?: number;
  /** When true, slightly lower bar so prefix-only typing surfaces hits. Default false */
  prefixMode?: boolean;
}

/**
 * Lower-cases, strips diacritics, and normalises common European ligatures
 * so `Müller`, `Mueller` and `Muller` all collapse to `muller`. Hyphens are
 * preserved for double-barrelled names like `Müller-Wagner`.
 */
export function normalizeName(s: string): string {
  if (!s) {return '';}
  // German transliteration: ä→ae, ö→oe, ü→ue, ß→ss — so `Mueller` and
  // `Müller` collapse to the same form. Done BEFORE NFD which would
  // otherwise strip the umlaut to a bare vowel and lose the equivalence.
  return s
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae').replace(/Ä/g, 'ae')
    .replace(/ö/g, 'oe').replace(/Ö/g, 'oe')
    .replace(/ü/g, 'ue').replace(/Ü/g, 'ue')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[øØ]/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 \-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classic two-row Levenshtein edit distance.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) {return 0;}
  if (!a.length) {return b.length;}
  if (!b.length) {return a.length;}

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) {prev[j] = j;}

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Per-part similarity helper. Combines edit-distance similarity with a
 * prefix bonus so partial typing (`Joh` → `Johannes`) still scores well.
 */
function partSimilarity(query: string, candidate: string): number {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) {return 0;}
  if (q === c) {return 1;}

  const dist = levenshtein(q, c);
  const editSim = 1 - dist / Math.max(q.length, c.length);

  // Prefix bonus: typeahead-friendly. Reward candidates that start with
  // what the user typed, scaled by how much they've typed so far.
  let prefixSim = 0;
  if (q.length >= 2 && c.startsWith(q)) {
    prefixSim = 0.7 + 0.3 * (q.length / c.length);
  }

  // Single-letter floor: a lone initial that matches the candidate's first
  // character is a soft hit (useful when only one name field is filled).
  let initialSim = 0;
  if (q.length === 1 && c.length > 0 && q[0] === c[0]) {
    initialSim = 0.6;
  }

  return Math.max(editSim, prefixSim, initialSim);
}

/**
 * Combined name similarity in [0..1]. Weights last name slightly higher
 * (more discriminating in practice) and detects first/last name swaps.
 */
export function nameSimilarity(
  query: { firstName: string; lastName: string },
  candidate: { firstName: string; lastName: string },
): number {
  const firstSim = partSimilarity(query.firstName ?? '', candidate.firstName ?? '');
  const lastSim = partSimilarity(query.lastName ?? '', candidate.lastName ?? '');
  const score = 0.45 * firstSim + 0.55 * lastSim;

  const swapFirst = partSimilarity(query.firstName ?? '', candidate.lastName ?? '');
  const swapLast = partSimilarity(query.lastName ?? '', candidate.firstName ?? '');
  const swapped = 0.45 * swapFirst + 0.55 * swapLast;

  if (swapped - score > 0.2) {
    // Small penalty so an exact non-swapped match always wins ties.
    return Math.max(0, swapped - 0.05);
  }
  return score;
}

function reasonFor(
  query: { firstName: string; lastName: string },
  candidate: { firstName: string; lastName: string },
  score: number,
): string {
  const qFirst = normalizeName(query.firstName ?? '');
  const qLast = normalizeName(query.lastName ?? '');
  const cFirst = normalizeName(candidate.firstName ?? '');
  const cLast = normalizeName(candidate.lastName ?? '');

  const swapFirst = partSimilarity(query.firstName ?? '', candidate.lastName ?? '');
  const swapLast = partSimilarity(query.lastName ?? '', candidate.firstName ?? '');
  const straight = 0.45 * partSimilarity(query.firstName ?? '', candidate.firstName ?? '')
    + 0.55 * partSimilarity(query.lastName ?? '', candidate.lastName ?? '');
  const swapped = 0.45 * swapFirst + 0.55 * swapLast;

  if (swapped - straight > 0.2) {return 'Vor-/Nachname vertauscht';}
  if (score >= 0.95) {return 'Name fast identisch';}
  if (qLast && cLast && qLast === cLast) {return 'Nachname identisch';}
  if (qFirst && cFirst && qFirst === cFirst) {return 'Vorname identisch';}
  if (qLast.length >= 2 && cLast.startsWith(qLast)) {return 'Nachname-Präfix';}
  if (qFirst.length >= 2 && cFirst.startsWith(qFirst)) {return 'Vorname-Präfix';}
  return 'Ähnlicher Name';
}

/**
 * Score, filter, and sort `candidates`. Tie-breaks prefer candidates that
 * already have an account (`appId`) — they are the stronger identity.
 */
export function rankCandidates<T extends PersonLike>(
  query: { firstName: string; lastName: string },
  candidates: T[],
  opts: RankOptions = {},
): RankedMatch<T>[] {
  const threshold = opts.threshold ?? (opts.prefixMode ? 0.5 : 0.55);
  const limit = opts.limit ?? 10;

  const scored: RankedMatch<T>[] = [];
  for (const candidate of candidates) {
    const score = nameSimilarity(query, candidate);
    if (score >= threshold) {
      scored.push({
        candidate,
        score,
        reason: reasonFor(query, candidate, score),
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {return b.score - a.score;}
    const aHas = a.candidate.appId ? 0 : 1;
    const bHas = b.candidate.appId ? 0 : 1;
    return aHas - bHas;
  });

  return scored.slice(0, limit);
}
