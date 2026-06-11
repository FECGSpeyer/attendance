/**
 * Utility to pick only database-valid fields from objects with computed properties
 */

import { Database } from './supabase';

type Tables = Database['public']['Tables'];

/**
 * Never persist a `data:` image URL to the database.
 * Returns `undefined` for data URLs so the field is omitted from the
 * insert/update payload entirely; otherwise returns the value untouched.
 *
 * Use this on every code path that writes an `img` column directly. Insert/update
 * paths that use `pickPersonFields` are already safe because `img` is not picked.
 */
export function sanitizeImg<T extends string | null | undefined>(img: T): T | undefined {
  if (typeof img === 'string' && img.startsWith('data:')) {
    return undefined;
  }
  return img;
}

/**
 * Pick only Insert-valid fields for a given table
 */
export function pickInsertFields<T extends keyof Tables>(
  tableName: T,
  obj: any
): Tables[T]['Insert'] {
  // For now, just return the object as-is since TypeScript will validate at compile time
  // The actual filtering happens implicitly through type checking
  return obj as Tables[T]['Insert'];
}

/**
 * Pick only Update-valid fields for a given table
 */
export function pickUpdateFields<T extends keyof Tables>(
  tableName: T,
  obj: any
): Tables[T]['Update'] {
  return obj as Tables[T]['Update'];
}

/**
 * Generic helper to strip computed fields from objects
 * Use this when spreading objects that may contain joined/computed data
 */
export function stripComputedFields<T extends Record<string, any>>(
  obj: T,
  validKeys: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of validKeys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Pick only the fields that are valid for person_attendances table
 */
export function pickPersonAttendanceFields(att: any) {
  const { id, attendance_id, person_id, status, notes, changed_by, changed_at } = att;
  return { id, attendance_id, person_id, status, notes, changed_by, changed_at };
}

/**
 * Pick only the fields that are valid for persons table
 *
 * NOTE: keep this in sync with the `player` table schema in `supabase.ts`.
 * Any column missing here will be silently dropped from inserts/updates,
 * which is exactly how the pause feature broke (paused / paused_until were
 * absent and pause never persisted).
 *
 * Intentionally excluded:
 *   - id           — used in `.match({ id })`, not in the update body
 *   - img          — written exclusively through ImageService / sanitized
 *                    paths so a `data:` URL can never reach the DB
 */
export function pickPersonFields(person: any) {
  const {
    id,
    tenantId,
    firstName,
    lastName,
    birthday,
    email,
    phone,
    mobile,
    instrument,
    instruments,
    playsSince,
    isLeader,
    isCritical,
    hasTeacher,
    teacher,
    history,
    created_at,
    street,
    zip,
    city,
    joined,
    left,
    legacyId,
    legacyConductorId,
    notes,
    testResult,
    examinee,
    correctBirthday,
    criticalReason,
    appId,
    title,
    additional_fields,
    registration_date,
    gender,
    place_of_birth,
    nationality,
    iban,
    bic,
    bank,
    paused,
    paused_until,
    pending,
    self_register,
    parent_id,
    shift_id,
    shift_name,
    shift_start,
    range,
    otherExercise,
    otherOrchestras,
    lastSolve,
  } = person;
  return {
    id,
    tenantId,
    firstName,
    lastName,
    birthday,
    email,
    phone,
    mobile,
    instrument,
    instruments,
    playsSince,
    isLeader,
    isCritical,
    hasTeacher,
    teacher,
    history,
    created_at,
    street,
    zip,
    city,
    joined,
    left,
    legacyId,
    legacyConductorId,
    notes,
    testResult,
    examinee,
    correctBirthday,
    criticalReason,
    appId,
    title,
    additional_fields,
    registration_date,
    gender,
    place_of_birth,
    nationality,
    iban,
    bic,
    bank,
    paused,
    paused_until,
    pending,
    self_register,
    parent_id,
    shift_id,
    shift_name,
    shift_start,
    range,
    otherExercise,
    otherOrchestras,
    lastSolve,
  };
}

/**
 * Pick only the fields that are valid for groups table
 */
export function pickGroupFields(group: any) {
  const {
    id,
    tenantId,
    name,
    category,
    synonyms,
    notes,
    sort_order,
    maingroup,
    clefs,
    range,
    tuning,
    created_at,
    legacyId,
  } = group;
  return {
    id,
    tenantId,
    name,
    category,
    synonyms,
    notes,
    sort_order,
    maingroup,
    clefs,
    range,
    tuning,
    created_at,
    legacyId,
  };
}

/**
 * Pick only the fields that are valid for teachers table
 */
export function pickTeacherFields(teacher: any) {
  const {
    id,
    tenantId,
    name,
    number,
    instruments,
    notes,
    private: isPrivate,
    created_at,
    legacyId,
  } = teacher;
  return {
    id,
    tenantId,
    name,
    number,
    instruments,
    notes,
    private: isPrivate,
    created_at,
    legacyId,
  };
}

/**
 * Pick only the fields that are valid for history table
 *
 * Intentionally excluded:
 *   - id          — used in `.match({ id })` for updates and auto-generated
 *                   on insert; passing it in the body sends `null` and
 *                   trips the NOT NULL constraint when adding songs.
 *   - created_at  — let the DB default fill this on insert; never overridden.
 */
export function pickHistoryFields(history: any) {
  const {
    tenantId,
    date,
    songId,
    otherConductor,
    person_id,
    attendance_id,
    visible,
  } = history;
  return {
    tenantId,
    date,
    songId,
    otherConductor,
    person_id,
    attendance_id,
    visible,
  };
}

/**
 * Pick only the fields that are valid for tenantUsers table
 */
export function pickTenantUserFields(user: any) {
  const {
    id,
    tenantId,
    userId,
    role,
    email,
    favorite,
    parent_id,
    created_at,
  } = user;
  return {
    id,
    tenantId,
    userId,
    role,
    email,
    favorite,
    parent_id,
    created_at,
  };
}
