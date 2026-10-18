-- Programmblöcke: gespeicherte Blockvorlagen (Kopf + Unterpunkte) pro Instanz.
-- Lesen dürfen alle Mitglieder (bestehende SELECT-Policy auf tenants),
-- speichern nur Admins (bestehende Policy admins_update_tenants).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_block_templates jsonb;
