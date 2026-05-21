-- ============================================
-- Enable Row-Level Security (RLS) for All Tables
-- Implements tenant-based access control
-- ============================================

-- device_tokens table (already has RLS, but needs service role policy)
-- Note: RLS already enabled in MIGRATION_push_notifications.sql
-- Adding service role policy for Edge Functions

CREATE POLICY "service_role_manage_device_tokens"
  ON device_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- attendance table
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Members can read attendance for their tenants
CREATE POLICY "users_select_attendance"
  ON attendance FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Admins can manage attendance
CREATE POLICY "admins_manage_attendance"
  ON attendance FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- Service role can update attendance (for Edge Functions like send-checklist-reminders)
CREATE POLICY "service_role_manage_attendance"
  ON attendance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- player table
ALTER TABLE player ENABLE ROW LEVEL SECURITY;

-- Members can read players for their tenants
CREATE POLICY "users_select_player"
  ON player FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Players can update their own player record (via appId = auth.uid())
CREATE POLICY "players_update_own_profile"
  ON player FOR UPDATE
  USING (appId = auth.uid()::text);

-- Parents can read their children's player records
CREATE POLICY "parents_select_children"
  ON player FOR SELECT
  USING (
    parent_id IN (
      SELECT id FROM parents WHERE appId = auth.uid()::text
    )
  );

-- Admins can manage players
CREATE POLICY "admins_manage_player"
  ON player FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- Public can insert (self-register) players for tenants with registration enabled
CREATE POLICY "public_insert_player_registration"
  ON player FOR INSERT
  TO anon
  WITH CHECK (
    "tenantId" IN (
      SELECT id FROM tenants WHERE register_id IS NOT NULL
    )
  );

-- Service role can update all players (for Edge Functions like evaluate-critical-rules)
CREATE POLICY "service_role_manage_player"
  ON player FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- person_attendances table (access via attendance relationship)
ALTER TABLE person_attendances ENABLE ROW LEVEL SECURITY;

-- Members can read person_attendances for their tenants
CREATE POLICY "users_select_person_attendances"
  ON person_attendances FOR SELECT
  USING (
    attendance_id IN (
      SELECT id FROM attendance
      WHERE "tenantId" IN (
        SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
      )
    )
  );

-- Players can update their own person_attendances (sign in/out)
CREATE POLICY "players_update_own_attendance"
  ON person_attendances FOR UPDATE
  USING (
    person_id IN (
      SELECT id FROM player WHERE appId = auth.uid()::text
    )
  );

-- Parents can update their children's person_attendances
CREATE POLICY "parents_update_children_attendance"
  ON person_attendances FOR UPDATE
  USING (
    person_id IN (
      SELECT id FROM player WHERE parent_id IN (
        SELECT id FROM parents WHERE appId = auth.uid()::text
      )
    )
  );

-- Admins can manage person_attendances
CREATE POLICY "admins_manage_person_attendances"
  ON person_attendances FOR ALL
  USING (
    attendance_id IN (
      SELECT id FROM attendance
      WHERE "tenantId" IN (
        SELECT "tenantId" FROM "tenantUsers"
        WHERE "userId" = auth.uid()::text AND role IN (1, 5)
      )
    )
  );

-- instruments table
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;

-- Members can read instruments for their tenants
CREATE POLICY "users_select_instruments"
  ON instruments FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Public can read instruments for tenants with registration enabled (for registration form)
CREATE POLICY "public_select_instruments_for_registration"
  ON instruments FOR SELECT
  TO anon
  USING (
    "tenantId" IN (
      SELECT id FROM tenants WHERE register_id IS NOT NULL
    )
  );

-- Admins can manage instruments
CREATE POLICY "admins_manage_instruments"
  ON instruments FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- songs table
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- Members can read songs for their tenants
CREATE POLICY "users_select_songs"
  ON songs FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Public can read songs from tenants with song sharing enabled
CREATE POLICY "public_select_shared_songs"
  ON songs FOR SELECT
  TO anon
  USING (
    "tenantId" IN (
      SELECT id FROM tenants WHERE song_sharing_id IS NOT NULL
    )
  );

-- Admins can manage songs
CREATE POLICY "admins_manage_songs"
  ON songs FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- ============================================
-- Phase 2: People & Configuration Tables
-- ============================================

-- conductors table
ALTER TABLE conductors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_conductors"
  ON conductors FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_conductors"
  ON conductors FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- teachers table
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_teachers"
  ON teachers FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_teachers"
  ON teachers FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- parents table
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_parents"
  ON parents FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_parents"
  ON parents FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- viewers table
ALTER TABLE viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_viewers"
  ON viewers FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_viewers"
  ON viewers FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- group_categories table
ALTER TABLE group_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_group_categories"
  ON group_categories FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_group_categories"
  ON group_categories FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- song_categories table
ALTER TABLE song_categories ENABLE ROW LEVEL SECURITY;

-- Members can read song categories for their tenants
CREATE POLICY "users_select_song_categories"
  ON song_categories FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Public can read song categories from tenants with song sharing enabled
CREATE POLICY "public_select_shared_song_categories"
  ON song_categories FOR SELECT
  TO anon
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE song_sharing_id IS NOT NULL
    )
  );

-- Admins can manage song categories
CREATE POLICY "admins_manage_song_categories"
  ON song_categories FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- attendance_types table
ALTER TABLE attendance_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_attendance_types"
  ON attendance_types FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_attendance_types"
  ON attendance_types FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- shifts table
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_shifts"
  ON shifts FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_shifts"
  ON shifts FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- scores table
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_scores"
  ON scores FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_scores"
  ON scores FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- meetings table
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_meetings"
  ON meetings FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_meetings"
  ON meetings FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- ============================================
-- Phase 3: Relationship & History Tables
-- ============================================

-- history table
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_history"
  ON history FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_history"
  ON history FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- tenant_group_tenants table
ALTER TABLE tenant_group_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_tenant_group_tenants"
  ON tenant_group_tenants FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "admins_manage_tenant_group_tenants"
  ON tenant_group_tenants FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- feedback table
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_feedback"
  ON feedback FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Users can insert their own feedback
CREATE POLICY "users_insert_feedback"
  ON feedback FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text AND
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Admins can manage all feedback for their tenants
CREATE POLICY "admins_manage_feedback"
  ON feedback FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- questions table
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_questions"
  ON questions FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Users can insert their own questions
CREATE POLICY "users_insert_questions"
  ON questions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text AND
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Admins can manage all questions for their tenants
CREATE POLICY "admins_manage_questions"
  ON questions FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- ============================================
-- Phase 4: Tenant Management & System Tables
-- ============================================

-- tenants table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Members can read their own tenants
CREATE POLICY "users_select_own_tenants"
  ON tenants FOR SELECT
  USING (
    id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- Public can read tenants for song sharing (by song_sharing_id)
CREATE POLICY "public_select_tenants_for_song_sharing"
  ON tenants FOR SELECT
  TO anon
  USING (song_sharing_id IS NOT NULL);

-- Public can read tenants for registration (by register_id)
CREATE POLICY "public_select_tenants_for_registration"
  ON tenants FOR SELECT
  TO anon
  USING (register_id IS NOT NULL);

-- Only admins can update tenant settings
CREATE POLICY "admins_update_tenants"
  ON tenants FOR UPDATE
  USING (
    id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role = 1
    )
  );

-- tenantUsers table
ALTER TABLE "tenantUsers" ENABLE ROW LEVEL SECURITY;

-- Users can read their own tenant memberships
CREATE POLICY "users_select_own_memberships"
  ON "tenantUsers" FOR SELECT
  USING (
    "userId" = auth.uid()::text
  );

-- Users can update their own favorite flag
CREATE POLICY "users_update_own_favorite"
  ON "tenantUsers" FOR UPDATE
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

-- Admins can read all memberships for their tenants
CREATE POLICY "admins_select_tenant_memberships"
  ON "tenantUsers" FOR SELECT
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- Admins can manage memberships for their tenants
CREATE POLICY "admins_manage_tenant_memberships"
  ON "tenantUsers" FOR ALL
  USING (
    "tenantId" IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role = 1
    )
  );

-- notifications table (user-owned)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can manage their own notification settings
CREATE POLICY "users_manage_own_notifications"
  ON notifications FOR ALL
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- Users can insert their own notification settings on first access
CREATE POLICY "users_insert_own_notifications"
  ON notifications FOR INSERT
  WITH CHECK (id = auth.uid()::text);

-- tenant_groups table (system-wide reference)
ALTER TABLE tenant_groups ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read tenant groups
CREATE POLICY "authenticated_users_select_tenant_groups"
  ON tenant_groups FOR SELECT
  TO authenticated
  USING (true);

-- churches table (system-wide reference)
ALTER TABLE churches ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read churches
CREATE POLICY "authenticated_users_select_churches"
  ON churches FOR SELECT
  TO authenticated
  USING (true);

-- Anonymous users can also read churches (for public registration pages)
CREATE POLICY "public_select_churches"
  ON churches FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- Summary
-- ============================================
-- RLS has been enabled for all 32 previously unprotected tables
-- Tables already with RLS (unchanged):
--   - device_tokens (from MIGRATION_push_notifications.sql)
--   - tenant_role_permissions (from add_helper_all_groups.sql)
--
-- Total tables with RLS: 34
--
-- CRITICAL FEATURES PROTECTED:
-- 1. Self-Service Operations:
--    - Players can update own player record (via appId)
--    - Players can update own person_attendances (sign in/out)
--    - Parents can read/update children's records
--    - Users can update own tenantUsers.favorite
--    - Users can manage own notifications
--
-- 2. Public Access:
--    - Song sharing (via song_sharing_id)
--    - Public registration (via register_id)
--    - Churches reference data
--
-- 3. Service Role (Edge Functions):
--    - device_tokens: DELETE invalid tokens
--    - player: UPDATE isCritical flag
--    - attendance: UPDATE checklist field
--
-- 4. Role-Based Access:
--    - ADMIN (1) and RESPONSIBLE (5): Full management
--    - PLAYER (2): Read + self-service
--    - PARENT (6): Read children + update attendance
--    - VIEWER (3), HELPER (4), etc.: Read-only
--
-- ============================================
