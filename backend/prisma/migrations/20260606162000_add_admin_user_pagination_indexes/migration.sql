-- Speed up admin user pagination ordered by newest accounts.
CREATE INDEX IF NOT EXISTS "users_created_at_desc_idx"
ON "users"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "users_role_created_at_desc_idx"
ON "users"("role", "created_at" DESC);
