BEGIN;
CREATE TABLE IF NOT EXISTS browser_sessions (
 token_hash text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('portal','client')),
 account_id integer NOT NULL,
 credential_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 absolute_expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS browser_session_account_idx ON browser_sessions(kind,account_id);
CREATE INDEX IF NOT EXISTS browser_session_expiry_idx ON browser_sessions(expires_at);
COMMIT;
