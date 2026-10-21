-- Apply once through the normal migration process before deploying the access fix.
-- No accounts are granted, renewed or reassigned by this migration.
BEGIN;
CREATE TABLE scanner_entitlements (
  client_id integer PRIMARY KEY REFERENCES app_access(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at timestamptz,
  reference text NOT NULL CHECK (length(btrim(reference)) > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
