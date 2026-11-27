-- Gemeinde App: Live-Anzeige laufender Ablaufpläne (Matthias, 27.11.2026).
-- Wer die Anzeige in der Gemeinde App eingeschaltet hat, bekommt die Live-Aktivität
-- der ORG-Pläne dort und nicht noch einmal aus Attendix. Pläne der eigenen Gruppe
-- laufen unverändert weiter. Die Gemeinde App meldet die Personen über die
-- fecg-bridge (Aktion live_skip); live-activity-tick überspringt sie bei ORG-Plänen.
-- Voraussetzung: add_gemeinde_app_link.sql.

CREATE TABLE IF NOT EXISTS gemeinde_app_live_skip (
  org_id    bigint NOT NULL REFERENCES tenant_groups(id) ON DELETE CASCADE,
  person_id bigint NOT NULL,
  PRIMARY KEY (org_id, person_id)
);

-- Nur über die Edge Functions (service_role); keine Policy = kein Zugriff für andere.
ALTER TABLE gemeinde_app_live_skip ENABLE ROW LEVEL SECURITY;
