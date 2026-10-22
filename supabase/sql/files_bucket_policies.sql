-- ============================================
-- Storage RLS policies for the `files` bucket (Dateiablage)
-- Object keys are prefixed with the tenant id: `<tenantId>/<path>`.
--
-- Only tenants with tenants.files_enabled = true (see add_tenant_files_toggle.sql).
-- Read (SELECT):
--   * Admin (1), Verantwortlicher (5), Helfer (4), Stimmführer-Helfer (9) of the tenant
--   * In tenants with files_shared = true every member except Bewerber (7) / None (99)
-- Write (INSERT/UPDATE/DELETE): only Admin (1) and Verantwortlicher (5).
--
-- Keep in sync with DbService.canAccessFiles() in src/app/services/db.service.ts.
--
-- Run in the Supabase dashboard SQL editor (needs the owner of storage.objects).
-- Idempotent: safe to re-run.
-- ============================================

DROP POLICY IF EXISTS "files_select_tenant_admin_responsible" ON storage.objects;
DROP POLICY IF EXISTS "files_select_tenant_members" ON storage.objects;
CREATE POLICY "files_select_tenant_members"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'files'
    AND split_part(name, '/', 1) ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM "tenantUsers" tu
      JOIN tenants t ON t.id = tu."tenantId" AND t.files_enabled
      WHERE tu."tenantId" = split_part(objects.name, '/', 1)::integer
        AND tu."userId" = auth.uid()::text
        AND (
          tu.role = ANY (ARRAY[1, 5, 4, 9])
          OR (t.files_shared AND tu.role <> ALL (ARRAY[7, 99]))
        )
    )
  );

DROP POLICY IF EXISTS "files_insert_tenant_admin_responsible" ON storage.objects;
CREATE POLICY "files_insert_tenant_admin_responsible"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'files'
    AND split_part(name, '/', 1) ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM "tenantUsers" tu
      JOIN tenants t ON t.id = tu."tenantId" AND t.files_enabled
      WHERE tu."tenantId" = split_part(objects.name, '/', 1)::integer
        AND tu."userId" = auth.uid()::text
        AND tu.role = ANY (ARRAY[1, 5])
    )
  );

DROP POLICY IF EXISTS "files_update_tenant_admin_responsible" ON storage.objects;
CREATE POLICY "files_update_tenant_admin_responsible"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND split_part(name, '/', 1) ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM "tenantUsers" tu
      JOIN tenants t ON t.id = tu."tenantId" AND t.files_enabled
      WHERE tu."tenantId" = split_part(objects.name, '/', 1)::integer
        AND tu."userId" = auth.uid()::text
        AND tu.role = ANY (ARRAY[1, 5])
    )
  )
  WITH CHECK (
    bucket_id = 'files'
    AND split_part(name, '/', 1) ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM "tenantUsers" tu
      JOIN tenants t ON t.id = tu."tenantId" AND t.files_enabled
      WHERE tu."tenantId" = split_part(objects.name, '/', 1)::integer
        AND tu."userId" = auth.uid()::text
        AND tu.role = ANY (ARRAY[1, 5])
    )
  );

DROP POLICY IF EXISTS "files_delete_tenant_admin_responsible" ON storage.objects;
CREATE POLICY "files_delete_tenant_admin_responsible"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND split_part(name, '/', 1) ~ '^[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM "tenantUsers" tu
      JOIN tenants t ON t.id = tu."tenantId" AND t.files_enabled
      WHERE tu."tenantId" = split_part(objects.name, '/', 1)::integer
        AND tu."userId" = auth.uid()::text
        AND tu.role = ANY (ARRAY[1, 5])
    )
  );
