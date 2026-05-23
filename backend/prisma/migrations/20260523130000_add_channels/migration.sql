-- ─────────────────────────────────────────────────────────────
-- Add Channels feature
-- 1. Create channels table
-- 2. Add is_pinned to batches
-- 3. For every existing batch: create a default "channel1"
-- 4. Add channel_id columns to messages / pinned_messages / mod_queue
-- 5. Backfill channel_id from each row's batch_id (using batch's channel1)
-- 6. Drop old batch_id columns + their FKs
-- ─────────────────────────────────────────────────────────────

-- 1. is_pinned on batches
ALTER TABLE "batches" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;

-- 2. Create channels table
CREATE TABLE "channels" (
    "id"         UUID         NOT NULL,
    "batch_id"   UUID         NOT NULL,
    "name"       TEXT         NOT NULL,
    "is_pinned"  BOOLEAN      NOT NULL DEFAULT false,
    "created_by" UUID         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "channels_batch_id_idx" ON "channels"("batch_id");

ALTER TABLE "channels"
    ADD CONSTRAINT "channels_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channels"
    ADD CONSTRAINT "channels_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- 3. Backfill: for every existing batch, create a default "channel1"
INSERT INTO "channels" ("id", "batch_id", "name", "is_pinned", "created_by", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    b."id",
    'channel1',
    false,
    b."created_by",
    NOW(),
    NOW()
FROM "batches" b;

-- 4. Add channel_id columns (nullable for now to allow backfill)
ALTER TABLE "messages"        ADD COLUMN "channel_id" UUID;
ALTER TABLE "pinned_messages" ADD COLUMN "channel_id" UUID;
ALTER TABLE "mod_queue"       ADD COLUMN "channel_id" UUID;

-- 5. Backfill channel_id from each row's batch_id (using the batch's default channel1)
UPDATE "messages" m
SET "channel_id" = c."id"
FROM "channels" c
WHERE c."batch_id" = m."batch_id" AND c."name" = 'channel1';

UPDATE "pinned_messages" p
SET "channel_id" = c."id"
FROM "channels" c
WHERE c."batch_id" = p."batch_id" AND c."name" = 'channel1';

UPDATE "mod_queue" q
SET "channel_id" = c."id"
FROM "channels" c
WHERE c."batch_id" = q."batch_id" AND c."name" = 'channel1';

-- 6. Make channel_id NOT NULL
ALTER TABLE "messages"        ALTER COLUMN "channel_id" SET NOT NULL;
ALTER TABLE "pinned_messages" ALTER COLUMN "channel_id" SET NOT NULL;
ALTER TABLE "mod_queue"       ALTER COLUMN "channel_id" SET NOT NULL;

-- 7. Drop old batch_id FKs + columns
ALTER TABLE "messages"        DROP CONSTRAINT IF EXISTS "messages_batch_id_fkey";
ALTER TABLE "pinned_messages" DROP CONSTRAINT IF EXISTS "pinned_messages_batch_id_fkey";
ALTER TABLE "mod_queue"       DROP CONSTRAINT IF EXISTS "mod_queue_batch_id_fkey";

ALTER TABLE "messages"        DROP COLUMN "batch_id";
ALTER TABLE "pinned_messages" DROP COLUMN "batch_id";
ALTER TABLE "mod_queue"       DROP COLUMN "batch_id";

-- 8. Add channel_id FKs
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pinned_messages"
    ADD CONSTRAINT "pinned_messages_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mod_queue"
    ADD CONSTRAINT "mod_queue_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Add channel_id index on messages (matches schema @@index)
CREATE INDEX "messages_channel_id_idx" ON "messages"("channel_id");
