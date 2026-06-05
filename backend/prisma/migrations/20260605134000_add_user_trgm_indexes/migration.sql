-- Speed up DM user search (`ILIKE '%term%'`) on username/email.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX IF NOT EXISTS "users_username_trgm_idx"
ON "users" USING GIN ("username" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_email_trgm_idx"
ON "users" USING GIN ("email" gin_trgm_ops);
