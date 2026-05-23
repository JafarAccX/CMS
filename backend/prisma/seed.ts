import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing tables in reverse dependency order
  console.log("🧹 Cleaning up existing tables...");
  await prisma.message.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.batchSettings.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ── Organization ─────────────────────────────────────────
  let org = await prisma.organization.findUnique({
    where: { slug: "acme-learning" },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Acme Learning",
        slug: "acme-learning",
      },
    });
  }

  // ── Users ────────────────────────────────────────────────
  const hash = await bcrypt.hash("password123", 12);

  // Helper helper to upsert a user
  const upsertUser = async (data: {
    username: string;
    email: string;
    password_hash: string;
    role: any;
    provider: any;
    subscription_status?: any;
  }) => {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return existing;
    return prisma.user.create({ data });
  };

  const admin = await upsertUser({
    username: "admin",
    email: "admin@acme.com",
    password_hash: hash,
    role: "admin",
    provider: "crm",
  });

  const mentorUser = await upsertUser({
    username: "mentor",
    email: "mentor@acme.com",
    password_hash: hash,
    role: "mentor",
    provider: "crm",
  });

  const modUser = await upsertUser({
    username: "moderator",
    email: "mod@acme.com",
    password_hash: hash,
    role: "batch_moderator",
    provider: "website",
  });

  const alice = await upsertUser({
    username: "alice",
    email: "alice@acme.com",
    password_hash: hash,
    role: "learner",
    provider: "website",
    subscription_status: "active",
  });

  const bob = await upsertUser({
    username: "bob",
    email: "bob@acme.com",
    password_hash: hash,
    role: "learner",
    provider: "website",
    subscription_status: "free",
  });

  const guestUser = await upsertUser({
    username: "guest",
    email: "guest@acme.com",
    password_hash: hash,
    role: "guest",
    provider: "website",
  });

  // ── Subscriptions ────────────────────────────────────────
  await prisma.subscription.create({
    data: {
      user_id: alice.id,
      plan: "pro",
      status: "active",
      started_at: new Date(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.subscription.create({
    data: {
      user_id: bob.id,
      plan: "free",
      status: "active",
      started_at: new Date(),
    },
  });

  // ── Batches ──────────────────────────────────────────────
  const generalBatch = await prisma.batch.create({
    data: {
      org_id: org.id,
      name: "General",
      description: "Open discussion for everyone",
      type: "general",
      is_paid: false,
      created_by: admin.id,
    },
  });

  await prisma.batchSettings.create({
    data: { batch_id: generalBatch.id, allow_guests: true },
  });

  const reactBatch = await prisma.batch.create({
    data: {
      org_id: org.id,
      name: "React Deep Dive",
      description: "Advanced React patterns and architecture",
      type: "private",
      is_paid: false,
      created_by: admin.id,
    },
  });

  await prisma.batchSettings.create({
    data: { batch_id: reactBatch.id, allow_guests: false },
  });

  const proBatch = await prisma.batch.create({
    data: {
      org_id: org.id,
      name: "Pro Workshop",
      description: "Exclusive paid workshop content",
      type: "paid",
      is_paid: true,
      created_by: admin.id,
    },
  });

  await prisma.batchSettings.create({
    data: { batch_id: proBatch.id, allow_guests: false },
  });

  // ── Memberships ──────────────────────────────────────────
  await prisma.membership.createMany({
    data: [
      { user_id: mentorUser.id, batch_id: reactBatch.id, role_in_batch: "mentor" },
      { user_id: modUser.id, batch_id: reactBatch.id, role_in_batch: "moderator" },
      { user_id: alice.id, batch_id: reactBatch.id, role_in_batch: "member" },
      { user_id: alice.id, batch_id: proBatch.id, role_in_batch: "member" },
      { user_id: bob.id, batch_id: reactBatch.id, role_in_batch: "member" },
    ],
  });

  // ── Auto-created channels (channel1 per batch) ──────────
  const [generalCh, reactCh, proCh] = await Promise.all([
    prisma.channel.create({
      data: { batch_id: generalBatch.id, name: "channel1", created_by: admin.id },
    }),
    prisma.channel.create({
      data: { batch_id: reactBatch.id, name: "channel1", created_by: admin.id },
    }),
    prisma.channel.create({
      data: { batch_id: proBatch.id, name: "channel1", created_by: admin.id },
    }),
  ]);

  // ── Seed Messages ────────────────────────────────────────
  const seedMessages = [
    { channel_id: generalCh.id, sender_id: admin.id, content: "Welcome to Acme Learning! 🎉" },
    { channel_id: generalCh.id, sender_id: alice.id, content: "Thanks! Excited to be here." },
    { channel_id: generalCh.id, sender_id: bob.id, content: "Hello everyone!" },
    { channel_id: reactCh.id, sender_id: mentorUser.id, content: "Welcome to React Deep Dive. Let's start with hooks." },
    { channel_id: reactCh.id, sender_id: alice.id, content: "Looking forward to learning advanced patterns!" },
    { channel_id: reactCh.id, sender_id: bob.id, content: "Can we cover useReducer vs useState?" },
    { channel_id: reactCh.id, sender_id: modUser.id, content: "Please keep discussions on topic." },
    { channel_id: proCh.id, sender_id: admin.id, content: "Pro Workshop is now live! 🚀" },
    { channel_id: proCh.id, sender_id: alice.id, content: "Great, let's dive in." },
    { channel_id: generalCh.id, sender_id: guestUser.id, content: "Just browsing as a guest." },
  ];

  for (const msg of seedMessages) {
    await prisma.message.create({
      data: {
        ...msg,
        message_type: "text",
      },
    });
  }

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
