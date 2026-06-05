import type { Prisma } from "@prisma/client";

export async function allocateChannelMessageSeq(tx: Prisma.TransactionClient, channelId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO "channel_message_sequences" ("channel_id", "last_seq")
    VALUES (${channelId}::uuid, 1)
    ON CONFLICT ("channel_id")
    DO UPDATE SET "last_seq" = "channel_message_sequences"."last_seq" + 1
    RETURNING "last_seq"
  `;

  const nextSeq = rows[0]?.last_seq;
  if (!nextSeq) {
    throw new Error("Failed to allocate channel message sequence");
  }
  return nextSeq;
}

export async function allocateConversationMessageSeq(
  tx: Prisma.TransactionClient,
  conversationId: string
): Promise<number> {
  const rows = await tx.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO "conversation_message_sequences" ("conversation_id", "last_seq")
    VALUES (${conversationId}::uuid, 1)
    ON CONFLICT ("conversation_id")
    DO UPDATE SET "last_seq" = "conversation_message_sequences"."last_seq" + 1
    RETURNING "last_seq"
  `;

  const nextSeq = rows[0]?.last_seq;
  if (!nextSeq) {
    throw new Error("Failed to allocate DM message sequence");
  }
  return nextSeq;
}
