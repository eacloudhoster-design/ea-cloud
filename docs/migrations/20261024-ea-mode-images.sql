-- Additive only: no updates, deletes, backfills or changes to trading tables.
BEGIN;
CREATE TABLE IF NOT EXISTS ea_mode_images (
  ea_id integer PRIMARY KEY REFERENCES eas(id) ON DELETE CASCADE,
  normal text,
  beast text,
  aggressive text,
  ultimate text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
