-- Apply after the existing scanner-entitlements and scanner-reports migrations.
-- No account grants, licence edits, record deletion or credit resets.
BEGIN;
ALTER TABLE scanner_entitlements ADD COLUMN credits_remaining integer
  CONSTRAINT scanner_entitlements_credits_check CHECK (credits_remaining IS NULL OR credits_remaining >= 0);
CREATE TABLE scanner_admin_sessions (
  token_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE scanner_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id integer NOT NULL REFERENCES users(id),
  client_id integer NOT NULL REFERENCES app_access(id),
  changes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
