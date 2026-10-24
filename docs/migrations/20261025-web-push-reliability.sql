-- Apply AFTER 20261024-web-push.sql, with explicit production approval.
-- No rows are reset, deleted or backfilled; legacy claimed events are not replayed.
BEGIN;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE push_events ADD COLUMN IF NOT EXISTS source_key text;
ALTER TABLE push_events ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE push_events ADD CONSTRAINT push_events_kind_check CHECK (kind IN ('started','stopped','trade_alert','trade_executed','trade_failed')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS push_event_source_idx ON push_events(client_id,source_key);
CREATE TABLE IF NOT EXISTS push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES push_events(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','retry','sent','failed','suppressed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 sent_at timestamptz, last_status integer
);
CREATE UNIQUE INDEX IF NOT EXISTS push_delivery_event_device_idx ON push_deliveries(event_id,subscription_id);
CREATE INDEX IF NOT EXISTS push_delivery_due_idx ON push_deliveries(state,next_attempt_at);
COMMIT;
