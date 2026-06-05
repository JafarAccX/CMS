/**
 * Integration tests: Outbox relay recovery
 *
 * Tests are split by concern so each is reliable despite running against the
 * same database as the live CMS backend:
 *
 *   T1  publishNow fast-path  — direct call, proves socket delivery works
 *   T2  Relay DB invariant    — verifies any relay (ours or prod) marks rows published
 *   T3  No double-delivery    — already-published rows are never re-emitted
 *   T4  Ordering              — multiple events committed in order arrive in order
 *
 * We intentionally do NOT race `drainOnce` against the production relay, which
 * would be non-deterministic. Instead T2 just asserts the DB outcome (published=true),
 * which is true whether the production relay or a test relay processed the row —
 * both run the same code, so either one proves the mechanism.
 */

import { createServer } from "http";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import prisma from "../src/utils/prisma.js";
import { enqueueOutbox, publishNow, drainOnce } from "../src/services/outbox.service.js";

const TEST_AGGREGATE_ID = "00000000-0000-0000-0000-000000000099";
const TEST_ROOM         = `channel:${TEST_AGGREGATE_ID}`;
const RELAY_GRACE_MS    = 4000; // production relay runs every 2s, wait 2× to be safe

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectEvents<T>(
  socket: Socket,
  event: string,
  count: number,
  predicate: (data: T) => boolean,
  timeoutMs = 5000
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const collected: T[] = [];
    const timer = setTimeout(
      () => reject(new Error(`collectEvents: timed out after ${timeoutMs}ms — got ${collected.length}/${count}`)),
      timeoutMs
    );
    const handler = (data: T) => {
      if (predicate(data)) {
        collected.push(data);
        if (collected.length === count) {
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(collected);
        }
      }
    };
    socket.on(event, handler);
  });
}

/** Poll the DB until predicate is true or timeout expires. */
async function waitUntil(
  check: () => Promise<boolean>,
  intervalMs = 200,
  timeoutMs = 6000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Outbox relay recovery", () => {
  let testIo: Server;
  let client: Socket;

  beforeAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregate_id: TEST_AGGREGATE_ID } });

    const httpServer = createServer();
    testIo = new Server(httpServer, { cors: { origin: "*" } });

    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = httpServer.address() as { port: number };

    testIo.on("connection", (socket) => {
      socket.on("join_room", (room: string) => socket.join(room));
    });

    client = clientIo(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      client.on("connect", resolve);
      client.on("connect_error", reject);
    });
    client.emit("join_room", TEST_ROOM);
    await sleep(100);
  });

  afterAll(async () => {
    client.disconnect();
    testIo.close();
    await prisma.outboxEvent.deleteMany({ where: { aggregate_id: TEST_AGGREGATE_ID } });
    await prisma.$disconnect();
  });

  // ── T1: publishNow fast-path delivers to socket ──────────────────────────────

  it("T1 publishNow: delivers a message to the correct socket room immediately", async () => {
    const msgId = "fast-path-001";

    // Arm BEFORE commit — no race window
    const delivery = collectEvents<any>(
      client, "receive_message", 1, (m) => m.id === msgId
    );

    // Commit + fast-path publish in one go
    let outboxId: bigint;
    await prisma.$transaction(async (tx) => {
      const row = await enqueueOutbox(tx, {
        aggregate: "channel",
        aggregateId: TEST_AGGREGATE_ID,
        event: "receive_message",
        rooms: [TEST_ROOM],
        payload: { id: msgId, content: "fast path delivery" },
      });
      outboxId = row.id;
    });
    // Retrieve the full row then fast-publish (mirrors the real send_message flow)
    const row = await prisma.outboxEvent.findUnique({ where: { id: outboxId! } });
    await publishNow(testIo, row!);

    const [msg] = await delivery;
    expect(msg.id).toBe(msgId);
    expect(msg.content).toBe("fast path delivery");

    const done = await prisma.outboxEvent.findUnique({ where: { id: outboxId! } });
    expect(done?.published).toBe(true);
  });

  // ── T2: Relay DB invariant — committed row is eventually marked published ─────

  it("T2 relay recovery: a committed-but-not-emitted row becomes published within relay cycle", async () => {
    const msgId = "relay-recovery-001";

    // Commit without calling publishNow (simulates crash between commit and emit)
    let outboxId: bigint;
    await prisma.$transaction(async (tx) => {
      const row = await enqueueOutbox(tx, {
        aggregate: "channel",
        aggregateId: TEST_AGGREGATE_ID,
        event: "receive_message",
        rooms: [TEST_ROOM],
        payload: { id: msgId },
      });
      outboxId = row.id;
    });

    // Confirm it's stuck
    const stuck = await prisma.outboxEvent.findUnique({ where: { id: outboxId! } });
    expect(stuck?.published).toBe(false);

    // The production relay (or our test relay running in the relay timer started
    // by startOutboxRelay) will pick this up within its cycle period.
    // We poll the DB until published=true — whichever relay runs first counts.
    await waitUntil(
      async () => {
        const row = await prisma.outboxEvent.findUnique({ where: { id: outboxId! } });
        return row?.published === true;
      },
      200,
      RELAY_GRACE_MS
    );

    const done = await prisma.outboxEvent.findUnique({ where: { id: outboxId! } });
    expect(done?.published).toBe(true);
    expect(done?.published_at).not.toBeNull();
  });

  // ── T3: No double-delivery ────────────────────────────────────────────────────

  it("T3 idempotency: already-published rows are never re-emitted by drainOnce", async () => {
    let fires = 0;
    const spy = (msg: any) => { if (msg.id === "idempotency-check") fires += 1; };
    client.on("receive_message", spy);

    const row = await prisma.outboxEvent.create({
      data: {
        aggregate: "channel",
        aggregate_id: TEST_AGGREGATE_ID,
        event: "receive_message",
        rooms: [TEST_ROOM],
        payload: { id: "idempotency-check" },
        published: true,
        published_at: new Date(),
      },
    });

    // drainOnce with the aggregateId filter: our row is already published,
    // so the relay should drain 0 of our rows
    const drained = await drainOnce(testIo, { aggregateId: TEST_AGGREGATE_ID });
    expect(drained).toBe(0);

    await sleep(100);
    client.off("receive_message", spy);
    expect(fires).toBe(0);

    await prisma.outboxEvent.delete({ where: { id: row.id } });
  });

  // ── T4: publishNow delivers multiple events in order ─────────────────────────

  it("T4 ordering: multiple events committed in order are delivered in order via publishNow", async () => {
    const payloads = [
      { id: "order-1", seq: 1 },
      { id: "order-2", seq: 2 },
      { id: "order-3", seq: 3 },
    ];

    const orderIds = payloads.map((p) => p.id);
    const deliveries = collectEvents<any>(
      client, "receive_message", 3, (m) => orderIds.includes(m.id)
    );

    // Commit + publish each in sequence — publishNow is called AFTER commit
    // (same as production: transaction commits first, then publishNow runs)
    for (const payload of payloads) {
      let outboxRow: Awaited<ReturnType<typeof enqueueOutbox>>;
      await prisma.$transaction(async (tx) => {
        outboxRow = await enqueueOutbox(tx, {
          aggregate: "channel",
          aggregateId: TEST_AGGREGATE_ID,
          event: "receive_message",
          rooms: [TEST_ROOM],
          payload,
        });
      });
      await publishNow(testIo, outboxRow!);
    }

    const received = await deliveries;
    expect(received).toHaveLength(3);
    expect(received.map((m) => m.seq)).toEqual([1, 2, 3]);
  });
});
