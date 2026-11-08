-- Additive application-only enrollment queue. Review/apply separately; never automatic at startup.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS mt5_enrollment_requests (
 id text PRIMARY KEY, owner_kind text NOT NULL CHECK(owner_kind IN ('mentor','client')),
 owner_id integer NOT NULL CHECK(owner_id>0), mentor_id integer NOT NULL CHECK(mentor_id>0),
 login text NOT NULL CHECK(login ~ '^[1-9][0-9]*$'), server text NOT NULL CHECK(length(server) BETWEEN 1 AND 100),
 broker text NOT NULL CHECK(broker IN ('justmarkets','exness','deriv','xm','rcg')),
 encrypted_password text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(owner_kind<>'mentor' OR owner_id=mentor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mt5_enrollment_account_unique ON mt5_enrollment_requests(login,server);
COMMIT;
