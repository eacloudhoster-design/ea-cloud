-- Apply before starting the updated API. Opaque credentials are stored only as hashes.
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash text PRIMARY KEY,
 account_id integer NOT NULL,
 kind text NOT NULL CHECK (kind IN ('client', 'portal')),
 role text NOT NULL,
 credential_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_sessions_account_idx ON auth_sessions(kind, account_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
