-- ============================================
-- Speicherlimit der Dateiablage je Instanz
--
-- tenants.files_max_bytes: maximale Belegung im Bucket `files` (NULL = unbegrenzt).
-- Standard 5 GB für neue Instanzen; GoS (12) und Mus. Dienst (194) unbegrenzt.
-- Nur der Super-Developer darf den Wert ändern (Trigger protect_tenant_files_flags, unten).
--
-- Die INSERT-Policy in files_bucket_policies.sql blockt Uploads, sobald die Belegung das
-- Limit erreicht hat. Die Größe einer neuen Datei kennt die Policy noch nicht, deshalb prüft
-- die App vorab genau; die letzte Datei kann das Limit höchstens einmal überschreiten.
-- Idempotent: safe to re-run.
-- ============================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS files_max_bytes bigint DEFAULT 5368709120;

UPDATE public.tenants SET files_max_bytes = NULL WHERE id IN (12, 194);

-- Belegung einer Instanz in Bytes. Nur für Mitglieder der Instanz, sonst NULL.
CREATE OR REPLACE FUNCTION public.files_used_bytes(p_tenant_id integer)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' OR EXISTS (
      SELECT 1 FROM public."tenantUsers" tu
      WHERE tu."tenantId" = p_tenant_id AND tu."userId" = auth.uid()::text
    )
    THEN (
      SELECT coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
      FROM storage.objects o
      WHERE o.bucket_id = 'files' AND o.name LIKE p_tenant_id::text || '/%'
    )
    ELSE NULL
  END;
$$;

GRANT EXECUTE ON FUNCTION public.files_used_bytes(integer) TO authenticated;

-- files_enabled/files_max_bytes: nur Super-Developer.
-- files_shared ("für alle Mitglieder"): Admins der Instanz in der Rollenverwaltung.
CREATE OR REPLACE FUNCTION public.protect_tenant_files_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  is_super boolean := coalesce(auth.role(), '') = 'service_role'
    OR coalesce(auth.jwt() ->> 'email', '') = 'developer@attendix.de'
    OR current_user IN ('postgres', 'supabase_admin');
BEGIN
  IF is_super THEN
    RETURN NEW;
  END IF;

  -- Aktivierung und Speicherlimit: nur Super-Developer.
  IF NEW.files_enabled IS DISTINCT FROM OLD.files_enabled
     OR NEW.files_max_bytes IS DISTINCT FROM OLD.files_max_bytes THEN
    RAISE EXCEPTION 'Nur der Super-Developer darf das Speicherlimit der Dateiablage ändern';
  END IF;

  -- Freigabe für alle Mitglieder: Admins der Instanz (Rollenverwaltung).
  IF NEW.files_shared IS DISTINCT FROM OLD.files_shared AND NOT EXISTS (
    SELECT 1 FROM public."tenantUsers" tu
    WHERE tu."tenantId" = NEW.id AND tu."userId" = auth.uid()::text AND tu.role = 1
  ) THEN
    RAISE EXCEPTION 'Nur Admins der Instanz dürfen die Dateiablage für alle Mitglieder freigeben';
  END IF;

  RETURN NEW;
END;
$$;
