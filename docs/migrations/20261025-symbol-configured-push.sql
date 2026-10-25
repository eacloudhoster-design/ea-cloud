-- Apply after 20261024-web-push.sql and 20261025-web-push-reliability.sql.
-- Additive event support only: no account, trading, subscription or event rows change.
BEGIN;
ALTER TABLE push_events DROP CONSTRAINT IF EXISTS push_events_kind_check;
ALTER TABLE push_events ADD CONSTRAINT push_events_kind_check
 CHECK (kind IN ('started','stopped','trade_alert','trade_executed','trade_failed','symbol_configured')) NOT VALID;
COMMIT;
