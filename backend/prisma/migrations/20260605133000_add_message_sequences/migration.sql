-- Deterministic per-thread message cursors.
-- Existing rows are numbered oldest-to-newest within each channel/conversation.

ALTER TABLE "messages"
ADD COLUMN IF NOT EXISTS "seq_id" INTEGER;

CREATE TABLE IF NOT EXISTS "channel_message_sequences" (
    "channel_id" UUID    NOT NULL,
    "last_seq"   INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "channel_message_sequences_pkey" PRIMARY KEY ("channel_id"),
    CONSTRAINT "channel_message_sequences_channel_id_fkey"
        FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

WITH numbered AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "channel_id"
            ORDER BY "created_at" ASC, "id" ASC
        )::INTEGER AS "seq_id"
    FROM "messages"
)
UPDATE "messages" AS "m"
SET "seq_id" = "n"."seq_id"
FROM "numbered" AS "n"
WHERE "m"."id" = "n"."id"
  AND "m"."seq_id" IS NULL;

INSERT INTO "channel_message_sequences" ("channel_id", "last_seq")
SELECT "channel_id", COALESCE(MAX("seq_id"), 0)
FROM "messages"
GROUP BY "channel_id"
ON CONFLICT ("channel_id") DO UPDATE
SET "last_seq" = GREATEST("channel_message_sequences"."last_seq", EXCLUDED."last_seq");

ALTER TABLE "messages"
ALTER COLUMN "seq_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "messages_channel_id_seq_id_key"
ON "messages"("channel_id", "seq_id");

CREATE INDEX IF NOT EXISTS "messages_channel_seq_desc_idx"
ON "messages"("channel_id", "seq_id" DESC);

ALTER TABLE "direct_messages"
ADD COLUMN IF NOT EXISTS "seq_id" INTEGER;

CREATE TABLE IF NOT EXISTS "conversation_message_sequences" (
    "conversation_id" UUID    NOT NULL,
    "last_seq"        INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conversation_message_sequences_pkey" PRIMARY KEY ("conversation_id"),
    CONSTRAINT "conversation_message_sequences_conversation_id_fkey"
        FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

WITH numbered AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "conversation_id"
            ORDER BY "created_at" ASC, "id" ASC
        )::INTEGER AS "seq_id"
    FROM "direct_messages"
)
UPDATE "direct_messages" AS "dm"
SET "seq_id" = "n"."seq_id"
FROM "numbered" AS "n"
WHERE "dm"."id" = "n"."id"
  AND "dm"."seq_id" IS NULL;

INSERT INTO "conversation_message_sequences" ("conversation_id", "last_seq")
SELECT "conversation_id", COALESCE(MAX("seq_id"), 0)
FROM "direct_messages"
GROUP BY "conversation_id"
ON CONFLICT ("conversation_id") DO UPDATE
SET "last_seq" = GREATEST("conversation_message_sequences"."last_seq", EXCLUDED."last_seq");

ALTER TABLE "direct_messages"
ALTER COLUMN "seq_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "direct_messages_conversation_id_seq_id_key"
ON "direct_messages"("conversation_id", "seq_id");

CREATE INDEX IF NOT EXISTS "direct_messages_conversation_seq_desc_idx"
ON "direct_messages"("conversation_id", "seq_id" DESC);
