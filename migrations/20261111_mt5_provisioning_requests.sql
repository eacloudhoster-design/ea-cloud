-- REVIEW ONLY. Not applied. Additive; existing users/credentials/records unchanged.
CREATE TABLE mt5_provisioning_requests (
 id uuid PRIMARY KEY,
 owner_kind text NOT NULL CHECK (owner_kind IN ('client','mentor')),
 owner_id integer NOT NULL CHECK (owner_id > 0),
 request_key uuid NOT NULL,
 request_hash text NOT NULL,
 broker text NOT NULL CHECK (broker IN ('deriv','exness','justmarkets','xm','rcg')),
 login text NOT NULL,
 server text NOT NULL,
 account_role text NOT NULL CHECK (account_role IN ('master','follower')),
 encrypted_password text,
 state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','provisioning','awaiting_verification','connected','failed','review_required','cancelled')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 UNIQUE (owner_kind,owner_id,request_key),
 CHECK ((owner_kind='client' AND account_role='follower') OR (owner_kind='mentor' AND account_role='master'))
);
CREATE INDEX mt5_provisioning_owner ON mt5_provisioning_requests(owner_kind,owner_id,created_at DESC);
CREATE INDEX mt5_provisioning_queue ON mt5_provisioning_requests(created_at) WHERE state='queued';
-- Terminal state transitions must erase encrypted_password. No plaintext column exists.

CREATE TABLE mt5_provisioning_audit (
 id bigserial PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES mt5_provisioning_requests(id),
 event text NOT NULL CHECK (event IN ('queued','provisioning','awaiting_verification','connected','review_required','cancelled','expired')),
 observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mt5_provisioning_audit_request ON mt5_provisioning_audit(request_id,id);
-- Fixed event names only; no request body, credentials or vendor errors in audit.
