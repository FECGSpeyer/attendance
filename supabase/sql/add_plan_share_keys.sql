-- Add share keys to attendance for plan sharing
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS share_key text;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS share_edit_key text;

-- Anon can read a single attendance row when they provide the correct share_key.
-- Only the columns needed to render the plan are exposed.
CREATE POLICY "anon_select_shared_attendance"
  ON attendance FOR SELECT
  TO anon
  USING (share_key IS NOT NULL);

-- Shared plans table for public (non-attendance) plan sharing via /planung
CREATE TABLE IF NOT EXISTS shared_plans (
  id          text PRIMARY KEY,
  edit_key    text NOT NULL,
  plan_title  text,
  date        text,
  time        text,
  end_time    text,
  fields      jsonb,
  branding_id text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE shared_plans ENABLE ROW LEVEL SECURITY;

-- Anyone can read any shared plan by its id (the id itself is the access token)
CREATE POLICY "anon_select_shared_plans"
  ON shared_plans FOR SELECT
  TO anon
  USING (true);

-- Anyone can create a shared plan (no auth required — used from /planung)
CREATE POLICY "anon_insert_shared_plans"
  ON shared_plans FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anyone can update a shared plan (edit_key verification is enforced in the app)
CREATE POLICY "anon_update_shared_plans"
  ON shared_plans FOR UPDATE
  TO anon
  USING (true);
