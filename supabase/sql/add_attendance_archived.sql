-- Termine archivieren (4.17.24, eingespielt 1.11.2026)
-- Archivierte Termine sehen nur Admins (Rolle 1) und Verantwortliche (Rolle 5).
-- RLS ist auf attendance/person_attendances aktuell nicht aktiv, daher filtert
-- die App (db.service) und die Edge Functions (iCal, Org-Pläne, Bridge) selbst.
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS attendance_tenant_archived_idx
  ON attendance ("tenantId") WHERE archived = true;
