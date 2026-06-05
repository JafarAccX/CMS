-- Transactional outbox for durable real-time event delivery.
-- Events are written in the same transaction as the domain row (message / DM);
-- a relay publishes them to Socket.IO and marks them published.

CREATE TABLE IF NOT EXISTS "outbox_events" (
    "id"           BIGSERIAL    NOT NULL,
    "aggregate"    TEXT         NOT NULL,
    "aggregate_id" UUID         NOT NULL,
    "event"        TEXT         NOT NULL,
    "rooms"        TEXT[]       NOT NULL,
    "payload"      JSONB        NOT NULL,
    "published"    BOOLEAN      NOT NULL DEFAULT false,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- relay: drain unpublished events in insertion order
CREATE INDEX IF NOT EXISTS "outbox_events_published_id_idx"
    ON "outbox_events"("published", "id");

-- resync: events for a channel/conversation newer than a cursor
CREATE INDEX IF NOT EXISTS "outbox_events_aggregate_idx"
    ON "outbox_events"("aggregate", "aggregate_id", "id");
