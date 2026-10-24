-- Additive only. Apply once, before enabling Web Push. No existing records change.
BEGIN;
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id integer NOT NULL REFERENCES app_access(id) ON DELETE CASCADE,
 endpoint_hash text NOT NULL, subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint_idx ON push_subscriptions(endpoint_hash);
CREATE INDEX IF NOT EXISTS push_subscription_client_idx ON push_subscriptions(client_id);
CREATE TABLE IF NOT EXISTS push_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id integer NOT NULL REFERENCES app_access(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('started','stopped')), created_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_event_pending_idx ON push_events(claimed_at,created_at);
COMMIT;
