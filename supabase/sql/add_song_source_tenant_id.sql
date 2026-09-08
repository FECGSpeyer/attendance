-- Werk-Synchronisierung: Zielinstanz nutzt Werkbibliothek der Quellinstanz
-- song_source_tenant_id auf Tenant B zeigt auf Tenant A; null = eigene Werke

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS song_source_tenant_id integer NULL
    REFERENCES tenants(id) ON DELETE SET NULL;

-- SELECT: Tenant-B-Nutzer dürfen Tenant-A-Songs lesen
CREATE POLICY "users_select_synced_songs"
  ON songs FOR SELECT
  USING (
    "tenantId" IN (
      SELECT t.song_source_tenant_id
      FROM tenants t
      JOIN "tenantUsers" tu ON tu."tenantId" = t.id
      WHERE tu."userId" = auth.uid()::text
        AND t.song_source_tenant_id IS NOT NULL
    )
  );

-- ALL: Admins von Tenant B dürfen Tenant-A-Songs verwalten
DROP POLICY IF EXISTS "admins_manage_songs" ON songs;
CREATE POLICY "admins_manage_songs"
  ON songs FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
      UNION
      SELECT t.song_source_tenant_id
      FROM tenants t
      JOIN "tenantUsers" tu ON tu."tenantId" = t.id
      WHERE tu."userId" = auth.uid()::text
        AND tu.role IN (1, 5)
        AND t.song_source_tenant_id IS NOT NULL
    )
  );

-- SELECT: Tenant-B-Nutzer dürfen Tenant-A-Kategorien lesen
CREATE POLICY "users_select_song_categories_synced"
  ON song_categories FOR SELECT
  USING (
    tenant_id IN (
      SELECT t.song_source_tenant_id
      FROM tenants t
      JOIN "tenantUsers" tu ON tu."tenantId" = t.id
      WHERE tu."userId" = auth.uid()::text
        AND t.song_source_tenant_id IS NOT NULL
    )
  );

-- ALL: Admins von Tenant B dürfen Tenant-A-Kategorien verwalten
DROP POLICY IF EXISTS "admins_manage_song_categories" ON song_categories;
CREATE POLICY "admins_manage_song_categories"
  ON song_categories FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
      UNION
      SELECT t.song_source_tenant_id
      FROM tenants t
      JOIN "tenantUsers" tu ON tu."tenantId" = t.id
      WHERE tu."userId" = auth.uid()::text
        AND tu.role IN (1, 5)
        AND t.song_source_tenant_id IS NOT NULL
    )
  );
