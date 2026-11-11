-- NEW REVIEW-ONLY additive migration. Never run by app startup.
ALTER TABLE client_settings ALTER COLUMN copying_enabled SET DEFAULT false;
-- Existing unmapped allocations remain retained and require explicit reconciliation.
ALTER TABLE observer_allocations ADD COLUMN account_login text, ADD COLUMN account_server text;
ALTER TABLE mt5_provisioning_requests ADD COLUMN account_mode text NOT NULL DEFAULT 'demo'
 CHECK (account_mode IN ('demo','live'));

CREATE TABLE mt5_account_inventory (
 id uuid PRIMARY KEY,
 owner_kind text NOT NULL CHECK (owner_kind IN ('client','mentor')),
 owner_id integer NOT NULL CHECK (owner_id > 0),
 broker text NOT NULL CHECK (broker IN ('deriv','exness','justmarkets','xm','rcg')),
 login text NOT NULL CHECK (login ~ '^[1-9][0-9]*$'),
 server text NOT NULL CHECK (length(server) BETWEEN 1 AND 256 AND server=btrim(server)),
 account_role text NOT NULL CHECK (account_role IN ('client','mentor')),
 account_mode text NOT NULL CHECK (account_mode IN ('demo','live')),
 encrypted_password text NOT NULL,
 state text NOT NULL DEFAULT 'linked' CHECK (state IN ('linked','disconnected')),
 verified_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (login,server),
 CHECK (account_role=owner_kind)
);
CREATE INDEX mt5_account_inventory_owner ON mt5_account_inventory(owner_kind,owner_id,created_at);
CREATE TABLE mt5_account_inventory_audit (
 id bigserial PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES mt5_account_inventory(id),
 event text NOT NULL CHECK (event IN ('linked','selected','disconnected')),
 observed_at timestamptz NOT NULL DEFAULT now()
);
