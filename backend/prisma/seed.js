import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
const prisma = new PrismaClient();
async function main() {
    console.log("🌱 Seeding database...");
    // ── Organization ─────────────────────────────────────────
    const org = await prisma.organization.create({
        data: {
            name: "Acme Learning",
            slug: "acme-learning",
        },
    });
    // ── Users ────────────────────────────────────────────────
    const hash = await bcrypt.hash("password123", 12);
    const admin = await prisma.user.create({
        data: {
            username: "admin",
            email: "admin@acme.com",
            password_hash: hash,
            role: "admin",
            provider: "crm",
        },
    });
    const mentorUser = await prisma.user.create({
        data: {
            username: "mentor",
            email: "mentor@acme.com",
            password_hash: hash,
            role: "mentor",
            provider: "crm",
        },
    });
    const modUser = await prisma.user.create({
        data: {
            username: "moderator",
            email: "mod@acme.com",
            password_hash: hash,
            role: "batch_moderator",
            provider: "website",
        },
    });
    const alice = await prisma.user.create({
        data: {
            username: "alice",
            email: "alice@acme.com",
            password_hash: hash,
            role: "learner",
            provider: "website",
            subscription_status: "active",
        },
    });
    const bob = await prisma.user.create({
        data: {
            username: "bob",
            email: "bob@acme.com",
            password_hash: hash,
            role: "learner",
            provider: "website",
            subscription_status: "free",
        },
    });
    const guestUser = await prisma.user.create({
        data: {
            username: "guest",
            email: "guest@acme.com",
            password_hash: hash,
            role: "guest",
            provider: "website",
        },
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
    // ── Seed Messages ────────────────────────────────────────
    const seedMessages = [
        { batch_id: generalBatch.id, sender_id: admin.id, content: "Welcome to Acme Learning! 🎉" },
        { batch_id: generalBatch.id, sender_id: alice.id, content: "Thanks! Excited to be here." },
        { batch_id: generalBatch.id, sender_id: bob.id, content: "Hello everyone!" },
        { batch_id: reactBatch.id, sender_id: mentorUser.id, content: "Welcome to React Deep Dive. Let's start with hooks." },
        { batch_id: reactBatch.id, sender_id: alice.id, content: "Looking forward to learning advanced patterns!" },
        { batch_id: reactBatch.id, sender_id: bob.id, content: "Can we cover useReducer vs useState?" },
        { batch_id: reactBatch.id, sender_id: modUser.id, content: "Please keep discussions on topic." },
        { batch_id: proBatch.id, sender_id: admin.id, content: "Pro Workshop is now live! 🚀" },
        { batch_id: proBatch.id, sender_id: alice.id, content: "Great, let's dive in." },
        { batch_id: generalBatch.id, sender_id: guestUser.id, content: "Just browsing as a guest." },
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
//# sourceMappingURL=seed.js.map