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
COMMIT;
