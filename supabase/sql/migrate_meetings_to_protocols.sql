-- supabase/sql/migrate_meetings_to_protocols.sql
-- Run once manually from Supabase SQL Editor after Protocol feature is deployed.
-- Migrates meetings.notes (Quill HTML) as plain-text Tiptap doc into protocols.
-- Orphaned meetings (no matching attendance on same date+tenantId) are left untouched.

INSERT INTO public.protocols (attendance_id, content, created_at, tenant_id)
SELECT
  a.id,
  jsonb_build_object(
    '__general__', jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(
            jsonb_build_object(
              'type', 'text',
              'text', COALESCE(m.notes, '')
            )
          )
        )
      )
    )
  ),
  m.created_at,
  m."tenantId"
FROM meetings m
JOIN LATERAL (
  SELECT id
  FROM attendance
  WHERE "tenantId" = m."tenantId"
    AND date = m.date::date::text
  ORDER BY id
  LIMIT 1
) a ON true
ON CONFLICT (attendance_id) DO NOTHING;

-- Verify:
-- SELECT COUNT(*) FROM public.protocols;
-- SELECT COUNT(*) FROM meetings m WHERE NOT EXISTS (
--   SELECT 1 FROM attendance a WHERE a."tenantId" = m."tenantId" AND a.date = m.date::date::text
-- );
