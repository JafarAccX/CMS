import type { Server } from "socket.io";
import type { Prisma } from "@prisma/client";
import prisma from "../utils/prisma.js";
import { incrementCounter, observeHistogram } from "../utils/metrics.js";

/**
 * Transactional Outbox
 * ────────────────────
 * The reliability problem: a message is committed to Postgres, then emitted over
 * Socket.IO. If the process crashes / the network drops between those two steps,
 * the event is gone with no retry.
 *
 * The fix: write the event into `outbox_events` inside the SAME transaction as the
 * domain row. Because they commit atomically, the event can never be lost.
 *   • Fast path  — emit inline right after commit (zero added latency) and mark published.
 *   • Safety net — a relay polls for any still-unpublished rows (crash / emit failure)
 *                  and re-emits them. Clients dedupe by message id, so re-delivery is safe.
 */

type Tx = Prisma.TransactionClient;

export interface OutboxInput {
  aggregate: "channel" | "dm" | "notification";
  aggregateId: string;
  event: string;
  rooms: string[];
  payload: unknown;
}

/** Minimal shape of an outbox row needed to publish it. */
interface PublishableEvent {
  id: bigint;
  rooms: string[];
  event: string;
  payload: unknown;
  created_at?: Date;
}

/**
 * Write an outbox event INSIDE an existing transaction so it commits atomically
 * with the domain write (message / DM). Returns the created row so the caller can
 * fast-path publish it immediately after the transaction commits.
 */
export function enqueueOutbox(tx: Tx, input: OutboxInput) {
  return tx.outboxEvent.create({
    data: {
      aggregate: input.aggregate,
      aggregate_id: input.aggregateId,
      event: input.event,
      rooms: input.rooms,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}

/**
 * Fast-path publish: emit immediately and mark published. Call right after the
 * transaction commits. If the emit or DB update fails, the row stays
 * published=false and the relay will retry it.
 */
export async function publishNow(io: Server, row: PublishableEvent): Promise<void> {
  try {
    io.to(row.rooms).emit(row.event, row.payload);
    await prisma.outboxEvent.update({
      where: { id: row.id },
      data: { published: true, published_at: new Date() },
    });
    incrementCounter("outbox_events_published_total", { mode: "fast_path" });
  } catch (err) {
    // Intentionally swallow — leave published=false so the relay recovers it.
    console.error("[outbox] publishNow failed (relay will retry):", err);
  }
}

/**
 * Drain a batch of unpublished events. Uses SELECT ... FOR UPDATE SKIP LOCKED so
 * multiple backend nodes can run the relay without double-processing the same row.
 */
async function drainOnce(io: Server): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<PublishableEvent[]>`
      SELECT id, rooms, event, payload, created_at
      FROM outbox_events
      WHERE published = false
      ORDER BY id ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return 0;

    const now = Date.now();
    const maxLagMs = Math.max(
      ...rows.map((row) => (row.created_at ? now - new Date(row.created_at).getTime() : 0))
    );
    observeHistogram("outbox_lag_ms", maxLagMs);

    for (const row of rows) {
      io.to(row.rooms).emit(row.event, row.payload);
    }

    await tx.outboxEvent.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { published: true, published_at: new Date() },
    });
    incrementCounter("outbox_events_published_total", { mode: "relay" }, rows.length);
    return rows.length;
  });
}

/**
 * Start the background relay. Runs once immediately (flushing anything left from a
 * previous crash), then polls on an interval. Returns a stop function.
 */
export function startOutboxRelay(io: Server, intervalMs = 2000): () => void {
  let running = false;

  const tick = async () => {
    if (running) return; // prevent overlapping runs
    running = true;
    try {
      // Keep draining while there is a full batch to clear backlogs quickly.
      let drained = await drainOnce(io);
      while (drained === 100) drained = await drainOnce(io);
    } catch (err) {
      console.error("[outbox] relay tick error:", err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  void tick(); // immediate startup flush
  console.log("📤 Outbox relay started");
  return () => clearInterval(timer);
}

/**
 * Resync support: replay events for a channel/conversation newer than the cursor
 * the client last saw. Lets a client that was offline during an emit catch up.
 */
export async function getEventsSince(
  aggregate: "channel" | "dm",
  aggregateId: string,
  sinceId: bigint
) {
  return prisma.outboxEvent.findMany({
    where: { aggregate, aggregate_id: aggregateId, id: { gt: sinceId } },
    orderBy: { id: "asc" },
    take: 200,
  });
}
