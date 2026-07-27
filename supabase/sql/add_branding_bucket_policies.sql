-- ============================================
-- Storage RLS policies for the `branding` bucket
-- Tenant logos are uploaded here by authenticated admins/responsibles.
--
-- Symptom this fixes: uploading a logo failed with a (previously empty) red
-- toast because storage.objects has RLS enabled but the new `branding` bucket
-- had no INSERT/UPDATE/DELETE policies, so uploads hit
-- "new row violates row-level security policy".
--
-- Idempotent: safe to re-run. Uploads use upsert:true, so INSERT *and* UPDATE
-- are both required. Reads are public (logo shown via getPublicUrl).
-- Scope kept simple (any authenticated user); tighten to tenant-admins later
-- if desired — object key is the tenant id.
-- ============================================

-- Public read: the logo is rendered from its public URL.
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

-- Authenticated users can upload a logo.
DROP POLICY IF EXISTS "branding_authenticated_insert" ON storage.objects;
CREATE POLICY "branding_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branding');

-- Authenticated users can overwrite an existing logo (upsert).
DROP POLICY IF EXISTS "branding_authenticated_update" ON storage.objects;
CREATE POLICY "branding_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'branding')
  WITH CHECK (bucket_id = 'branding');

-- Authenticated users can remove a logo.
DROP POLICY IF EXISTS "branding_authenticated_delete" ON storage.objects;
CREATE POLICY "branding_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'branding');
