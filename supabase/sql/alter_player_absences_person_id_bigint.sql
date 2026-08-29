DROP POLICY IF EXISTS "members can insert absences" ON player_absences;
DROP POLICY IF EXISTS "members can delete absences" ON player_absences;

ALTER TABLE player_absences
  ALTER COLUMN person_id TYPE bigint;

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
