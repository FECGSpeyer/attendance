-- Mehrsprachigkeit (Phase 1): Sprache pro Nutzer und Standardsprache pro Instanz.
-- Konzept: plans/mehrsprachigkeit-konzept.md
--
-- notifications.language: UI-Sprache des Nutzers. Edge Functions lesen sie für
--   Push, Telegram und E-Mails. NULL = noch nicht gewählt (Gerätesprache / Deutsch).
-- tenants.default_language: Sprache für Standarddaten beim Anlegen, Kalender-Feeds
--   und öffentliche Seiten der Instanz.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS language text
  CHECK (language IS NULL OR language IN ('de', 'en', 'ru', 'es'));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'de'
  CHECK (default_language IN ('de', 'en', 'ru', 'es'));
