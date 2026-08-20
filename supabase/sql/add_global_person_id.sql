ALTER TABLE player ADD COLUMN IF NOT EXISTS global_person_id uuid DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_player_global_person_id
  ON player(global_person_id)
  WHERE global_person_id IS NOT NULL;
