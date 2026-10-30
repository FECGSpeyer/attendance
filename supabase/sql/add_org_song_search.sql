-- Werke organisationsweit suchen und kopieren
-- Admins/Verantwortliche einer Instanz durchsuchen die Werke aller anderen Instanzen ihrer Organisation.
-- RLS auf songs bleibt unverändert: gelesen wird nur über diese Funktion, geschrieben mit den normalen Rechten.

-- Herkunft eines kopierten Werks: { tenantId, tenantName, songId, copiedAt }
ALTER TABLE songs ADD COLUMN IF NOT EXISTS copied_from jsonb NULL;

CREATE OR REPLACE FUNCTION search_org_songs(
  p_tenant_id bigint,
  p_query text DEFAULT '',
  p_tenant_ids bigint[] DEFAULT NULL,
  p_only_with_files boolean DEFAULT false,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  tenant_id bigint,
  tenant_name text,
  name text,
  number bigint,
  prefix text,
  "withChoir" boolean,
  "withSolo" boolean,
  link text,
  difficulty smallint,
  category_names text[],
  additional_fields jsonb,
  field_defs jsonb,
  beamer_file jsonb,
  files jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_org bigint;
  v_own_library bigint;
  v_q text := lower(trim(coalesce(p_query, '')));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "tenantUsers" tu
    WHERE tu."tenantId" = p_tenant_id
      AND tu."userId" = auth.uid()::text
      AND tu.role IN (1, 5)
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT gt.tenant_group INTO v_org
  FROM tenant_group_tenants gt WHERE gt.tenant_id = p_tenant_id LIMIT 1;
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(t.song_source_tenant_id, t.id) INTO v_own_library
  FROM tenants t WHERE t.id = p_tenant_id;

  RETURN QUERY
  SELECT
    s.id,
    s."tenantId",
    t."shortName"::text,
    s.name,
    s.number,
    s.prefix,
    s."withChoir",
    s."withSolo",
    s.link,
    s.difficulty,
    ARRAY(
      SELECT c.name FROM song_categories c
      WHERE c.id = ANY(coalesce(s.category_ids, ARRAY[]::uuid[])) OR c.id = s.category
    )::text[],
    s.additional_fields,
    to_jsonb(t.song_additional_fields),
    s.beamer_file,
    coalesce((
      SELECT jsonb_agg(f || jsonb_build_object('groupName', i.name, 'groupSynonyms', i.synonyms))
      FROM unnest(s.files) f
      LEFT JOIN instruments i ON i.id = nullif(f->>'instrumentId', '')::bigint
    ), '[]'::jsonb),
    count(*) OVER ()
  FROM songs s
  JOIN tenants t ON t.id = s."tenantId"
  JOIN tenant_group_tenants gt ON gt.tenant_id = t.id AND gt.tenant_group = v_org
  WHERE t.song_source_tenant_id IS NULL -- Instanzen mit Werk-Sync haben keine eigene Bibliothek
    AND t.id <> v_own_library
    AND (p_tenant_ids IS NULL OR t.id = ANY(p_tenant_ids))
    AND (NOT p_only_with_files OR coalesce(array_length(s.files, 1), 0) > 0)
    AND (
      v_q = ''
      OR lower(s.name) LIKE '%' || v_q || '%'
      OR lower(coalesce(s.prefix, '') || s.number::text) LIKE v_q || '%'
      OR s.number::text = v_q
    )
  ORDER BY
    (lower(s.name) = v_q) DESC,
    (lower(s.name) LIKE v_q || '%') DESC,
    s.name,
    t."shortName"
  LIMIT least(coalesce(p_limit, 50), 200)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION search_org_songs(bigint, text, bigint[], boolean, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION search_org_songs(bigint, text, bigint[], boolean, int, int) TO authenticated;
