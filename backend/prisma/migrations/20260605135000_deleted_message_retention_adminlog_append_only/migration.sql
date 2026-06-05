-- Retention support for soft-deleted channel messages.
CREATE INDEX IF NOT EXISTS "messages_deleted_retention_idx"
ON "messages"("deleted_at")
WHERE "is_deleted" = true;

-- Admin logs are audit records: append-only at the database layer.
CREATE OR REPLACE FUNCTION prevent_admin_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_logs are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "admin_logs_prevent_update" ON "admin_logs";
CREATE TRIGGER "admin_logs_prevent_update"
BEFORE UPDATE ON "admin_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_log_mutation();

DROP TRIGGER IF EXISTS "admin_logs_prevent_delete" ON "admin_logs";
CREATE TRIGGER "admin_logs_prevent_delete"
BEFORE DELETE ON "admin_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_log_mutation();
