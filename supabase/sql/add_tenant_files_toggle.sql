-- ============================================
-- Dateiablage je Instanz schaltbar
--
-- tenants.files_enabled: Dateiablage in der Instanz aktiv
--   (Admin, Verantwortliche, Helfer, Stimmführer-Helfer)
-- tenants.files_shared:  zusätzlich für alle Mitglieder außer Bewerber freigegeben
--
-- Nur der Super-Developer (developer@attendix.de) darf die beiden Spalten ändern
-- (Trigger unten). Ersetzt FILES_SHARED_TENANT_IDS und die Beta-Prüfung im Client.
--
-- Danach files_bucket_policies.sql erneut ausführen (prüft jetzt files_enabled/files_shared).
-- Idempotent: safe to re-run.
-- ============================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS files_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS files_shared boolean NOT NULL DEFAULT false;

-- Bisherige Nutzung übernehmen: GoS (12) als Beta-Instanz, Mus. Dienst (194) für alle freigegeben.
UPDATE public.tenants SET files_enabled = true WHERE id IN (12, 194) AND files_enabled = false;
UPDATE public.tenants SET files_shared = true WHERE id = 194 AND files_shared = false;

CREATE OR REPLACE FUNCTION public.protect_tenant_files_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.files_enabled IS DISTINCT FROM OLD.files_enabled
      OR NEW.files_shared IS DISTINCT FROM OLD.files_shared)
     AND coalesce(auth.role(), '') <> 'service_role'
     AND coalesce(auth.jwt() ->> 'email', '') <> 'developer@attendix.de'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Nur der Super-Developer darf die Dateiablage ein- oder ausschalten';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_tenant_files_flags ON public.tenants;
CREATE TRIGGER protect_tenant_files_flags
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tenant_files_flags();
