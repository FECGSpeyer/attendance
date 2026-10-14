-- supabase/sql/remigrate_meetings_formatted.sql
-- Übernimmt die alten Besprechungen (meetings) mit Formatierung in die
-- "Allgemeinen Notizen" (__general__) der Protokolle. Die erste Migration
-- (migrate_meetings_to_protocols.sql) hatte nur reinen Text übernommen.
--
-- Wandelt das HTML aus Quill/Tiptap in ein Tiptap-Dokument um: Absätze,
-- Überschriften, (verschachtelte) Listen, Zitate, fett/kursiv/unterstrichen/
-- durchgestrichen und Zeilenumbrüche. Besprechungen im alten Delta-Format
-- ([{"insert": "..."}]) werden vorher ausgepackt.
--
-- Die Hilfsfunktionen liegen in pg_temp und verschwinden mit der Verbindung.

CREATE OR REPLACE FUNCTION pg_temp.mt_unescape(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(replace(replace(replace(t,
    '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', ''''), '&#160;', ' '), '&#xA0;', ' '), '&amp;', '&')
$$;

-- HTML (oder Delta mit HTML darin) → wohlgeformtes XML unter <root>.
CREATE OR REPLACE FUNCTION pg_temp.mt_prepare(notes text) RETURNS xml
LANGUAGE plpgsql AS $$
DECLARE
  html text := coalesce(notes, '');
BEGIN
  IF html LIKE '[{%' THEN
    SELECT string_agg(coalesce(op->>'insert', ''), '') INTO html
    FROM jsonb_array_elements(notes::jsonb) op;
  END IF;
  html := regexp_replace(html, '<br\s*/?>', '<br/>', 'gi');
  html := regexp_replace(html, '<hr\s*/?>', '<hr/>', 'gi');
  html := regexp_replace(html, '<img[^>]*>', '', 'gi');
  html := replace(html, '&nbsp;', '&#160;');
  html := replace(replace(replace(html, '&auml;', 'ä'), '&ouml;', 'ö'), '&uuml;', 'ü');
  html := replace(replace(replace(html, '&Auml;', 'Ä'), '&Ouml;', 'Ö'), '&Uuml;', 'Ü');
  html := replace(replace(replace(html, '&szlig;', 'ß'), '&euro;', '€'), '&ndash;', '–');
  html := replace(replace(html, '&mdash;', '—'), '&hellip;', '…');
  RETURN xmlparse(document '<root>' || html || '</root>');
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mt_name(node xml) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN node::text LIKE '<%' THEN lower((xpath('name(/*)', node))[1]::text) END
$$;

-- Inline-Inhalt → Liste von Text-/hardBreak-Knoten.
CREATE OR REPLACE FUNCTION pg_temp.mt_inline(node xml, marks jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  child xml;
  result jsonb := '[]'::jsonb;
  name text;
  txt text;
  m jsonb;
BEGIN
  FOREACH child IN ARRAY coalesce(xpath('/*/node()', node), ARRAY[]::xml[]) LOOP
    name := pg_temp.mt_name(child);
    IF name IS NULL THEN
      txt := regexp_replace(pg_temp.mt_unescape(child::text), '\s+', ' ', 'g');
      IF txt <> '' THEN
        result := result || jsonb_build_array(
          CASE WHEN jsonb_array_length(marks) > 0
            THEN jsonb_build_object('type', 'text', 'text', txt, 'marks', marks)
            ELSE jsonb_build_object('type', 'text', 'text', txt) END);
      END IF;
    ELSIF name = 'br' THEN
      result := result || jsonb_build_array(jsonb_build_object('type', 'hardBreak'));
    ELSE
      m := marks;
      IF name IN ('strong', 'b') AND NOT m @> '[{"type":"bold"}]' THEN m := m || '[{"type":"bold"}]'; END IF;
      IF name IN ('em', 'i') AND NOT m @> '[{"type":"italic"}]' THEN m := m || '[{"type":"italic"}]'; END IF;
      IF name = 'u' AND NOT m @> '[{"type":"underline"}]' THEN m := m || '[{"type":"underline"}]'; END IF;
      IF name IN ('s', 'strike', 'del') AND NOT m @> '[{"type":"strike"}]' THEN m := m || '[{"type":"strike"}]'; END IF;
      result := result || pg_temp.mt_inline(child, m);
    END IF;
  END LOOP;
  RETURN result;
END $$;

-- Trims leading/trailing whitespace of a paragraph's text and drops it when empty.
CREATE OR REPLACE FUNCTION pg_temp.mt_paragraph(kind text, inline jsonb, level int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  n int := jsonb_array_length(inline);
BEGIN
  IF n > 0 AND inline->0->>'type' = 'text' THEN
    inline := jsonb_set(inline, '{0,text}', to_jsonb(ltrim(inline->0->>'text')));
  END IF;
  IF n > 0 AND inline->(n - 1)->>'type' = 'text' THEN
    inline := jsonb_set(inline, ARRAY[(n - 1)::text, 'text'], to_jsonb(rtrim(inline->(n - 1)->>'text')));
  END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO inline
  FROM jsonb_array_elements(inline) x WHERE x->>'type' <> 'text' OR x->>'text' <> '';
  -- Quill writes empty lines as <p><br></p>: no line breaks at the edges.
  WHILE jsonb_array_length(inline) > 0 AND inline->0->>'type' = 'hardBreak' LOOP
    inline := inline - 0;
  END LOOP;
  WHILE jsonb_array_length(inline) > 0 AND inline->-1->>'type' = 'hardBreak' LOOP
    inline := inline - (jsonb_array_length(inline) - 1);
  END LOOP;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'type', kind,
    'attrs', CASE WHEN level IS NOT NULL THEN jsonb_build_object('level', level) END,
    'content', CASE WHEN jsonb_array_length(inline) > 0 THEN inline END));
END $$;

-- Block-Inhalt → Liste von Block-Knoten. Lose Inline-Teile werden zu Absätzen.
CREATE OR REPLACE FUNCTION pg_temp.mt_blocks(node xml) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  child xml;
  result jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
  name text;
  items jsonb;
  li xml;
  li_inline jsonb;
  li_blocks jsonb;
  sub xml;
  sub_name text;
BEGIN
  FOREACH child IN ARRAY coalesce(xpath('/*/node()', node), ARRAY[]::xml[]) LOOP
    name := pg_temp.mt_name(child);
    IF name IS NULL OR name IN ('strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'span', 'a', 'br', 'code', 'mark', 'sub', 'sup', 'font') THEN
      -- inline at block level: collect
      IF name IS NULL THEN
        IF trim(pg_temp.mt_unescape(child::text)) <> '' THEN
          pending := pending || jsonb_build_array(jsonb_build_object('type', 'text',
            'text', regexp_replace(pg_temp.mt_unescape(child::text), '\s+', ' ', 'g')));
        END IF;
      ELSIF name = 'br' THEN
        pending := pending || jsonb_build_array(jsonb_build_object('type', 'hardBreak'));
      ELSE
        pending := pending || pg_temp.mt_inline(xmlelement(name "wrap", child), '[]'::jsonb);
      END IF;
      CONTINUE;
    END IF;
    IF jsonb_array_length(pending) > 0 THEN
      result := result || jsonb_build_array(pg_temp.mt_paragraph('paragraph', pending));
      pending := '[]'::jsonb;
    END IF;
    IF name IN ('p', 'div') THEN
      result := result || jsonb_build_array(pg_temp.mt_paragraph('paragraph', pg_temp.mt_inline(child, '[]'::jsonb)));
    ELSIF name ~ '^h[1-6]$' THEN
      result := result || jsonb_build_array(pg_temp.mt_paragraph('heading', pg_temp.mt_inline(child, '[]'::jsonb),
        least(substr(name, 2)::int, 3)));
    ELSIF name IN ('ul', 'ol') THEN
      items := '[]'::jsonb;
      FOREACH li IN ARRAY coalesce(xpath('/*/*', child), ARRAY[]::xml[]) LOOP
        li_inline := '[]'::jsonb;
        li_blocks := '[]'::jsonb;
        FOREACH sub IN ARRAY coalesce(xpath('/*/node()', li), ARRAY[]::xml[]) LOOP
          sub_name := pg_temp.mt_name(sub);
          IF sub_name IN ('ul', 'ol', 'p', 'div', 'blockquote') THEN
            li_blocks := li_blocks || pg_temp.mt_blocks(xmlelement(name "wrap", sub));
          ELSE
            li_inline := li_inline || pg_temp.mt_inline(xmlelement(name "wrap", sub), '[]'::jsonb);
          END IF;
        END LOOP;
        IF jsonb_array_length(li_inline) > 0 OR jsonb_array_length(li_blocks) = 0 THEN
          li_blocks := jsonb_build_array(pg_temp.mt_paragraph('paragraph', li_inline)) || li_blocks;
        ELSIF li_blocks->0->>'type' <> 'paragraph' THEN
          li_blocks := jsonb_build_array(jsonb_build_object('type', 'paragraph')) || li_blocks;
        END IF;
        items := items || jsonb_build_array(jsonb_build_object('type', 'listItem', 'content', li_blocks));
      END LOOP;
      IF jsonb_array_length(items) > 0 THEN
        result := result || jsonb_build_array(jsonb_build_object(
          'type', CASE WHEN name = 'ul' THEN 'bulletList' ELSE 'orderedList' END, 'content', items));
      END IF;
    ELSIF name = 'blockquote' THEN
      items := pg_temp.mt_blocks(child);
      IF jsonb_array_length(items) > 0 THEN
        result := result || jsonb_build_array(jsonb_build_object('type', 'blockquote', 'content', items));
      END IF;
    ELSIF name = 'hr' THEN
      result := result || jsonb_build_array(jsonb_build_object('type', 'horizontalRule'));
    ELSE
      result := result || pg_temp.mt_blocks(child);
    END IF;
  END LOOP;
  IF jsonb_array_length(pending) > 0 THEN
    result := result || jsonb_build_array(pg_temp.mt_paragraph('paragraph', pending));
  END IF;
  RETURN result;
END $$;

-- Ganzes Dokument; leere Absätze am Anfang/Ende und doppelte Leerzeilen fallen weg.
CREATE OR REPLACE FUNCTION pg_temp.mt_doc(notes text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  blocks jsonb;
  cleaned jsonb := '[]'::jsonb;
  b jsonb;
  prev_empty boolean := true;
  is_empty boolean;
BEGIN
  blocks := pg_temp.mt_blocks(pg_temp.mt_prepare(notes));
  FOR b IN SELECT value FROM jsonb_array_elements(blocks) LOOP
    is_empty := b->>'type' = 'paragraph' AND b->'content' IS NULL;
    IF is_empty AND prev_empty THEN CONTINUE; END IF;
    cleaned := cleaned || jsonb_build_array(b);
    prev_empty := is_empty;
  END LOOP;
  IF jsonb_array_length(cleaned) > 0 AND cleaned->-1->>'type' = 'paragraph' AND cleaned->-1->'content' IS NULL THEN
    cleaned := cleaned - (jsonb_array_length(cleaned) - 1);
  END IF;
  RETURN jsonb_build_object('type', 'doc', 'content', cleaned);
END $$;

-- ============================================================
-- Ausführen (am 14.10.2026 in Prod gelaufen)
-- ============================================================

-- Sicherung der bisherigen Inhalte (RLS ohne Policies: über die API nicht lesbar).
CREATE TABLE IF NOT EXISTS public.backup_protocols_meetings_20261014 AS
SELECT p.id, p.attendance_id, p.content, p.updated_at
FROM public.protocols p
JOIN public.attendance a ON a.id = p.attendance_id
JOIN public.meetings m ON m."tenantId" = p.tenant_id
  AND (m.date AT TIME ZONE 'UTC')::date = (a.date AT TIME ZONE 'UTC')::date;
ALTER TABLE public.backup_protocols_meetings_20261014 ENABLE ROW LEVEL SECURITY;

-- 1. Bereits übernommene Besprechungen: Allgemeine Notizen mit Formatierung ersetzen.
UPDATE public.protocols p
SET content = jsonb_set(p.content, '{__general__}', pg_temp.mt_doc(m.notes))
FROM public.attendance a, public.meetings m
WHERE a.id = p.attendance_id
  AND m."tenantId" = p.tenant_id
  AND (m.date AT TIME ZONE 'UTC')::date = (a.date AT TIME ZONE 'UTC')::date;

-- 2. Bisher übersprungene Besprechungen (altes Delta-Format) ohne Protokoll:
--    Termin "Besprechung" anlegen wie die erste Migration, Anwesende, Protokoll.
WITH missing AS (
  SELECT m.*
  FROM public.meetings m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.protocols p JOIN public.attendance a ON a.id = p.attendance_id
    WHERE p.tenant_id = m."tenantId"
      AND (a.date AT TIME ZONE 'UTC')::date = (m.date AT TIME ZONE 'UTC')::date)
),
new_att AS (
  INSERT INTO public.attendance (date, "tenantId", "typeInfo", type_id, save_in_history, notes)
  SELECT to_char(m.date AT TIME ZONE 'UTC', 'YYYY-MM-DD')::timestamptz, m."tenantId", 'Besprechung',
    (SELECT id FROM public.attendance_types WHERE tenant_id = m."tenantId" ORDER BY created_at LIMIT 1),
    false, ''
  FROM missing m
  RETURNING id, "tenantId", date
),
pairs AS (
  SELECT na.id AS attendance_id, m.*
  FROM new_att na JOIN missing m ON m."tenantId" = na."tenantId"
    AND (m.date AT TIME ZONE 'UTC')::date = (na.date AT TIME ZONE 'UTC')::date
),
people AS (
  INSERT INTO public.person_attendances (attendance_id, person_id, status, notes)
  SELECT p.attendance_id, unnest(p.attendees::bigint[]), 1, ''
  FROM pairs p WHERE p.attendees IS NOT NULL
  ON CONFLICT (attendance_id, person_id) DO NOTHING
  RETURNING 1
)
INSERT INTO public.protocols (attendance_id, content, created_at, tenant_id, status, published_at)
SELECT p.attendance_id, jsonb_build_object('__general__', pg_temp.mt_doc(p.notes)),
  p.created_at, p."tenantId", 'published', p.created_at
FROM pairs p;
