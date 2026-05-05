-- Migration: Add configurable absence and late reasons to tenants table
-- Run this SQL in your Supabase SQL Editor

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS absence_reasons text[],
ADD COLUMN IF NOT EXISTS late_reasons text[];

COMMENT ON COLUMN tenants.absence_reasons IS 'Configurable absence reasons for signout. Falls back to defaults if NULL.';
COMMENT ON COLUMN tenants.late_reasons IS 'Configurable late arrival reasons. Falls back to defaults if NULL.';
