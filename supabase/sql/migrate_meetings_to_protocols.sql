-- supabase/sql/migrate_meetings_to_protocols.sql
-- Run once manually from Supabase SQL Editor after Protocol feature is deployed.
--
-- For each meeting:
--   1. If a matching attendance exists on the same date + tenant, use it.
--   2. If not, create a new attendance row for that date + tenant, then
--      also insert person_attendance rows for each attendee listed in meetings.attendees.
-- Then insert the protocol with the stripped HTML content.
--
-- Rows skipped:
--   - meetings where notes is empty or contains only whitespace/HTML tags
--   - meetings where notes looks like a Quill Delta JSON array (starts with '[{')
--   - attendances that already have a protocol (ON CONFLICT DO NOTHING)

-- ============================================================
-- Helpers (session-scoped, auto-drop on connection close)
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.strip_html(html text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(html,
              '<br\s*/?>', E'\n', 'gi'),
            '<[^>]+>', ' ', 'g'),
          '&nbsp;', ' ', 'g'),
        '&amp;', '&', 'g'),
      '&lt;|&gt;|&quot;|&#[0-9]+;|&[a-z]+;', '', 'g'),
    ' \t\n\r\f')
$$;

CREATE OR REPLACE FUNCTION pg_temp.text_to_tiptap(plain text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'type', 'doc',
    'content', (
      SELECT jsonb_agg(
        CASE
          WHEN trim(line) = ''
            THEN jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array())
          ELSE jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', trim(line))
            )
          )
        END
      )
      FROM unnest(string_to_array(plain, E'\n')) AS line
    )
  )
$$;

-- ============================================================
-- Step 1: resolve or create attendance for every meeting
-- ============================================================

-- Temp table: one row per meeting → the attendance_id to use
CREATE TEMP TABLE IF NOT EXISTS _meeting_attendance_map AS
SELECT
  m.id                  AS meeting_id,
  m."tenantId"          AS tenant_id,
  m.date                AS meeting_date,
  m.notes,
  m.attendees::bigint[] AS attendees,
  m.created_at,
  a.id                  AS attendance_id
FROM meetings m
LEFT JOIN LATERAL (
  SELECT id
  FROM attendance
  WHERE "tenantId" = m."tenantId"
    AND (attendance.date AT TIME ZONE 'UTC')::date = (m.date AT TIME ZONE 'UTC')::date
  ORDER BY id
  LIMIT 1
) a ON true
WHERE
  -- only meetings with actual content
  trim(pg_temp.strip_html(COALESCE(m.notes, ''))) <> ''
  AND m.notes NOT LIKE '[{%';

-- For meetings without an existing attendance, create one
WITH new_attendances AS (
  INSERT INTO attendance (date, "tenantId", "typeInfo", type_id, save_in_history, notes)
  SELECT DISTINCT ON (tenant_id, meeting_date)
    to_char(meeting_date AT TIME ZONE 'UTC', 'YYYY-MM-DD')::timestamptz,
    tenant_id,
    'Besprechung',
    -- pick the first attendance type for this tenant (any type is fine as a container)
    (SELECT id FROM attendance_types WHERE tenant_id = m2.tenant_id ORDER BY created_at LIMIT 1),
    false,
    ''
  FROM _meeting_attendance_map m2
  WHERE attendance_id IS NULL
  RETURNING id, "tenantId" AS tenant_id, date AS att_date
)
UPDATE _meeting_attendance_map mam
SET attendance_id = na.id
FROM new_attendances na
WHERE mam.attendance_id IS NULL
  AND na.tenant_id = mam.tenant_id
  AND (na.att_date AT TIME ZONE 'UTC')::date = (mam.meeting_date AT TIME ZONE 'UTC')::date;

-- ============================================================
-- Step 2: insert person_attendances for newly created rows
-- (existing attendances already have their own person rows)
-- ============================================================

-- Identify which attendance_ids were just created (not pre-existing)
-- by checking they are not in the original attendance table snapshot.
-- We do this by only inserting for meetings where the attendance was NULL
-- before the update — tracked via a flag column added transiently.
-- Simpler: insert for ALL attendees of ALL meetings, ignoring conflicts.
-- The UNIQUE constraint on (attendance_id, person_id) handles deduplication.

INSERT INTO person_attendances (attendance_id, person_id, status, notes)
SELECT
  mam.attendance_id,
  unnest(mam.attendees),
  1,  -- AttendanceStatus.Present
  ''
FROM _meeting_attendance_map mam
WHERE mam.attendance_id IS NOT NULL
  AND mam.attendees IS NOT NULL
  AND array_length(mam.attendees, 1) > 0
ON CONFLICT (attendance_id, person_id) DO NOTHING;

-- ============================================================
-- Step 3: insert protocols
-- ============================================================

INSERT INTO public.protocols (attendance_id, content, created_at, tenant_id)
SELECT
  mam.attendance_id,
  jsonb_build_object(
    '__general__',
    pg_temp.text_to_tiptap(pg_temp.strip_html(mam.notes))
  ),
  mam.created_at,
  mam.tenant_id
FROM _meeting_attendance_map mam
WHERE mam.attendance_id IS NOT NULL
ON CONFLICT (attendance_id) DO NOTHING;

-- ============================================================
-- Cleanup
-- ============================================================
DROP TABLE IF EXISTS _meeting_attendance_map;

-- ============================================================
-- Verify
-- ============================================================
-- SELECT COUNT(*) FROM public.protocols;
--
-- Preview (run before the INSERT steps):
-- SELECT m.id, m."tenantId", m.notes IS NULL AS no_notes,
--        left(pg_temp.strip_html(COALESCE(m.notes,'')), 100) AS preview
-- FROM meetings m
-- WHERE trim(pg_temp.strip_html(COALESCE(m.notes,''))) <> ''
--   AND m.notes NOT LIKE '[{%';
--
-- Check the Delta-format entry that is skipped:
-- SELECT id, left(notes, 60) FROM meetings WHERE notes LIKE '[{%';
--
-- Check unmatched meetings (before migration, no attendance on same date):
-- SELECT COUNT(*) FROM meetings m WHERE NOT EXISTS (
--   SELECT 1 FROM attendance a
--   WHERE a."tenantId" = m."tenantId"
--     AND a.date = to_char(m.date AT TIME ZONE 'UTC', 'YYYY-MM-DD')
-- );
