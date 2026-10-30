-- Review and apply explicitly. Never run by the API startup runner.
BEGIN;
CREATE TABLE IF NOT EXISTS robot_builds (
 id text PRIMARY KEY, mentor_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, ea_id integer NOT NULL REFERENCES eas(id) ON DELETE CASCADE,
 display_name text NOT NULL, manager_name text NOT NULL, template_version text NOT NULL, token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, last_seen_at timestamptz, last_event_at timestamptz,
 source_account text, source_server text
);
CREATE INDEX IF NOT EXISTS robot_builds_owner_idx ON robot_builds(mentor_id,created_at);
CREATE TABLE IF NOT EXISTS robot_events (
 id text PRIMARY KEY, robot_id text NOT NULL REFERENCES robot_builds(id) ON DELETE CASCADE, mentor_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_account text NOT NULL, source_server text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS robot_event_source_unique ON robot_events(mentor_id,source_account,source_server,event_id);
CREATE INDEX IF NOT EXISTS robot_events_robot_received_idx ON robot_events(robot_id,received_at);
-- Nullable legacy-queue link: old signals and payloads remain compatible.
ALTER TABLE trade_signals ADD COLUMN IF NOT EXISTS observer_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS trade_signal_observer_event_unique ON trade_signals(observer_event_id) WHERE observer_event_id IS NOT NULL;
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'capture';
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS source_magic text NOT NULL DEFAULT '12345';
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS copy_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS start_sequence numeric(20,0);
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS last_sequence numeric(20,0);
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS inventory_count integer;
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS queue_depth integer;
ALTER TABLE robot_builds ADD COLUMN IF NOT EXISTS history_healthy boolean NOT NULL DEFAULT false;
ALTER TABLE robot_events ADD COLUMN IF NOT EXISTS signal_id integer;
ALTER TABLE robot_events ADD COLUMN IF NOT EXISTS copy_state text NOT NULL DEFAULT 'capture_only';
CREATE UNIQUE INDEX IF NOT EXISTS observer_one_active_source ON robot_builds(mentor_id,source_account,source_server) WHERE copy_enabled=true AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS observer_positions (
 key text PRIMARY KEY, robot_id text NOT NULL REFERENCES robot_builds(id) ON DELETE CASCADE, mentor_id integer NOT NULL,
 position_id text NOT NULL, sequence numeric(20,0) NOT NULL, volume text NOT NULL, side text NOT NULL, symbol text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS observer_allocations (
 id text PRIMARY KEY, client_id integer NOT NULL, source_key text NOT NULL, mentor_id integer NOT NULL,
 symbol text NOT NULL, scale text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS observer_allocation_unique ON observer_allocations(client_id,source_key);
COMMIT;
