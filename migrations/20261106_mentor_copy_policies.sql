-- Reviewed migration proposal only. Never applied by the read-only entry point.
BEGIN;
CREATE TABLE IF NOT EXISTS mentor_copy_policies (
 client_id integer PRIMARY KEY, mentor_id integer NOT NULL, enabled boolean NOT NULL DEFAULT false,
 lot_mode text NOT NULL CHECK(lot_mode IN ('fixed','proportional')),fixed_lot_size numeric(10,4) NOT NULL CHECK(fixed_lot_size>0),
 allocation_percent numeric(7,2) NOT NULL CHECK(allocation_percent>0 AND allocation_percent<=100),max_lot_size numeric(10,4) NOT NULL CHECK(max_lot_size>0),
 max_exposure_lots numeric(10,4) NOT NULL CHECK(max_exposure_lots>=max_lot_size),max_open_trades integer NOT NULL CHECK(max_open_trades BETWEEN 1 AND 100),
 max_daily_drawdown numeric(5,2) NOT NULL CHECK(max_daily_drawdown>0 AND max_daily_drawdown<=25),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(fixed_lot_size<=max_lot_size)
);
CREATE TABLE IF NOT EXISTS mentor_copy_policy_audit (
 id serial PRIMARY KEY,client_id integer NOT NULL,mentor_id integer NOT NULL,action text NOT NULL,snapshot text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mt5_connections ADD COLUMN IF NOT EXISTS encrypted_mt5_password text;
COMMIT;
