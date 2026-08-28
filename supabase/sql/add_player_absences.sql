CREATE TABLE IF NOT EXISTS player_absences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  created_by  text,
  tenant_id   integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id   integer NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  from_date   date NOT NULL,
  until_date  date NOT NULL,
  reason      text NOT NULL
);

ALTER TABLE player_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read absences"
  ON player_absences FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = (auth.uid()::text)
    )
  );

-- appId is stored as uuid in the DB (exposed as string in TS types)
-- so cast appId::uuid = auth.uid() rather than auth.uid()::text = appId
CREATE POLICY "members can insert absences"
  ON player_absences FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = (auth.uid()::text)
        AND (
          role IN (1, 5)
          OR EXISTS (
            SELECT 1 FROM player p
            WHERE p.id = player_absences.person_id
              AND p."appId"::uuid = auth.uid()
          )
        )
    )
  );

CREATE POLICY "members can delete absences"
  ON player_absences FOR DELETE
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = (auth.uid()::text)
        AND (
          role IN (1, 5)
          OR EXISTS (
            SELECT 1 FROM player p
            WHERE p.id = player_absences.person_id
              AND p."appId"::uuid = auth.uid()
          )
        )
    )
  );
