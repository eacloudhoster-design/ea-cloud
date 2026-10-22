-- Additive. Review/apply before deploying activity API. Never run a reset/db push.
BEGIN;
CREATE TABLE trading_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id integer NOT NULL REFERENCES app_access(id) ON DELETE CASCADE,
 source text NOT NULL CHECK (source IN ('mentor','scanner','system')),
 level text NOT NULL CHECK (level IN ('info','success','warning','error')),
 message text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trading_activity_client_created_idx ON trading_activity(client_id,created_at DESC);
COMMIT;
