-- Add creator ownership to shared_plans
-- Run this in the Supabase SQL editor

ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shared_plans_creator ON shared_plans(creator_user_id);

-- Authenticated users can select their own plans
CREATE POLICY "auth_select_own_shared_plans" ON shared_plans
  FOR SELECT TO authenticated USING (creator_user_id = auth.uid());

-- Authenticated users can delete their own plans
CREATE POLICY "auth_delete_own_shared_plans" ON shared_plans
  FOR DELETE TO authenticated USING (creator_user_id = auth.uid());
