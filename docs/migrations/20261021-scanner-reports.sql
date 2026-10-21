-- REVIEW/APPLY SEPARATELY before enabling the scanner backend. Not run by app startup.
-- Additive only: existing client, licence, branding and trade records are untouched.
BEGIN;
CREATE TABLE scanner_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES app_access(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chart', 'fundamental')),
  strategy text,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scanner_reports_client_created_idx ON scanner_reports (client_id, created_at DESC);
COMMIT;
