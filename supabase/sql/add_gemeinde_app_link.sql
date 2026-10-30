-- Anbindung an die Gemeinde App (FECG Speyer, FECG Schwegenheim):
-- ORG-Pläne mit "Beamer-Datei nötig" und SongBeamer-Dateien aus der Mediathek.
-- Pro Programmpunkt liegen uid, needsBeamer und beamerFile im Plan-JSON (keine Spalte nötig).

-- Freischaltung je Organisation; nur in der Datenbank setzbar.
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS fecg_link_enabled boolean NOT NULL DEFAULT false;
-- Org-Einstellung "Beamer-Dateien im Ablaufplan".
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS beamer_files_enabled boolean NOT NULL DEFAULT false;
-- Verbindungsschlüssel der Gemeinde App: nur SHA-256 (hex) und die letzten 4 Zeichen.
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS gemeinde_app_key_hash text;
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS gemeinde_app_key_hint text;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_groups_gemeinde_app_key_hash_idx
  ON tenant_groups (gemeinde_app_key_hash) WHERE gemeinde_app_key_hash IS NOT NULL;

-- SongBeamer-Datei eines Werks: { name, path, linkedAt }, geschrieben von der Gemeinde App.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS beamer_file jsonb;

-- Die Freischaltung kann man über die App nicht ändern, nur mit service_role (SQL-Editor, Edge Functions).
CREATE OR REPLACE FUNCTION keep_fecg_link_enabled() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fecg_link_enabled IS DISTINCT FROM OLD.fecg_link_enabled
     AND coalesce(auth.role(), '') NOT IN ('service_role', '') THEN
    NEW.fecg_link_enabled := OLD.fecg_link_enabled;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_groups_keep_fecg_link ON tenant_groups;
CREATE TRIGGER tenant_groups_keep_fecg_link
  BEFORE UPDATE ON tenant_groups
  FOR EACH ROW EXECUTE FUNCTION keep_fecg_link_enabled();

-- Freischalten. Vorher prüfen, ob genau diese zwei Organisationen getroffen werden:
--   SELECT id, name FROM tenant_groups WHERE name IN ('FECG Speyer', 'FECG Schwegenheim');
UPDATE tenant_groups SET fecg_link_enabled = true
  WHERE name IN ('FECG Speyer', 'FECG Schwegenheim');
