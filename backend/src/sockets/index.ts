import { Server } from "socket.io";
import { verifyAccessToken } from "../utils/jwt.js";
import prisma from "../utils/prisma.js";
import { canSendMessage } from "../utils/permissions.js";
import {
  socketSendMessageSchema,
  socketJoinChannelSchema,
  socketSendDmSchema,
  socketJoinDmSchema,
} from "../validators/index.js";
import { redisSet, redisDel } from "../utils/redis.js";
import { parseMentions } from "../services/message.service.js";
import { allocateChannelMessageSeq } from "../services/message-sequence.service.js";
import { sendDirectMessage } from "../services/dm.service.js";
import { enqueueOutbox, publishNow } from "../services/outbox.service.js";
import { incrementCounter } from "../utils/metrics.js";

interface ServerToClientEvents {
  receive_message: (message: any) => void;
  user_joined: (data: { userId: string; username: string }) => void;
  user_left: (data: { userId: string; username: string }) => void;
  typing_indicator: (data: { userId: string; username: string; channelId: string; typing: boolean }) => void;
  notify_user: (notification: any) => void;
  notification_read: (data: { notificationId: string }) => void;
  mod_queue_updated: (item: any) => void;
  reaction_updated: (data: { messageId: string; reactions: any[] }) => void;
  receive_dm: (message: any) => void;
  dm_typing: (data: { conversationId: string; userId: string; username: string; typing: boolean }) => void;
  user_online: (data: { userId: string }) => void;
  user_offline: (data: { userId: string }) => void;
  dm_read: (data: { conversationId: string; readBy: string }) => void;
}

interface AttachmentPayload {
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

interface ClientToServerEvents {
  join_channel: (data: { channelId: string }) => void;
  leave_channel: (data: { channelId: string }) => void;
  send_message: (data: { channelId: string; content?: string; messageType?: "text" | "file" | "system"; parentId?: string; tempId?: string; attachments?: AttachmentPayload[] }) => void;
  typing_start: (data: { channelId: string }) => void;
  typing_stop: (data: { channelId: string }) => void;
  mark_read: (data: { notificationId: string }) => void;
  join_dm: (data: { conversationId: string }) => void;
  leave_dm: (data: { conversationId: string }) => void;
  send_dm: (data: { conversationId: string; content?: string; tempId?: string; attachments?: AttachmentPayload[] }) => void;
  dm_typing_start: (data: { conversationId: string }) => void;
  dm_typing_stop: (data: { conversationId: string }) => void;
  mark_dm_read: (data: { conversationId: string }) => void;
  toggle_reaction: (data: { messageId: string; emoji: string }) => void;
}

interface InterServerEvents {}
interface SocketData {
  userId: string;
  username: string;
}

/**
 * Helper: load channel + parent batch + caller's membership for permission checks.
 */
async function loadChannelContext(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { batch: { include: { batch_settings: true } } },
  });
  if (!channel) return null;

  const [user, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.membership.findUnique({
      where: { user_id_batch_id: { user_id: userId, batch_id: channel.batch_id } },
    }),
  ]);

  if (!user) return null;
  return { channel, user, membership };
}

export function initSockets(io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth.token;
      if (!token) return next(new Error("Authentication error: No token provided"));
      if (token.startsWith("Bearer ")) token = token.slice(7);

      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });

      if (!user) return next(new Error("Authentication error: User not found"));
      if (user.is_banned) return next(new Error("Authentication error: Banned"));

      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch (err) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { userId, username } = socket.data;
    incrementCounter("socket_connections_total", { event: "connect" });
    console.log(`🔌 Socket connected: ${username} (${socket.id})`);

    // Personal room for private notifications
    socket.join(`user:${userId}`);

    // Online status & broadcast
    redisSet(`user:online:${userId}`, "1", 30);
    io.emit("user_online", { userId });

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      redisSet(`user:online:${userId}`, "1", 30);
    }, 15000);

    // ── Channel Events ──────────────────────────────────
    socket.on("join_channel", async (data) => {
      try {
        const { channelId } = socketJoinChannelSchema.parse(data);
        socket.join(`channel:${channelId}`);
        io.to(`channel:${channelId}`).emit("user_joined", { userId, username });
      } catch (err) {
        console.error("join_channel error:", err);
      }
    });

    socket.on("leave_channel", (data) => {
      try {
        const { channelId } = socketJoinChannelSchema.parse(data);
        socket.leave(`channel:${channelId}`);
        io.to(`channel:${channelId}`).emit("user_left", { userId, username });
      } catch (err) {
        console.error("leave_channel error:", err);
      }
    });

    socket.on("send_message", async (data) => {
      try {
        const { channelId, content, messageType, parentId, tempId, attachments } = socketSendMessageSchema.parse(data);

        const ctx = await loadChannelContext(channelId, userId);
        if (!ctx) {
          console.warn(`🚫 Channel not found or user missing for ${channelId}`);
          return;
        }
        const { channel, user, membership } = ctx;

        if (!canSendMessage(user, channel.batch, membership)) {
          console.warn(`🚫 User ${username} permission denied for channel ${channelId}`);
          return;
        }

        // Atomic write: the message and its outbox event commit together, so the
        // real-time event can never be lost even if the process crashes here.
        const { message, outboxEvent } = await prisma.$transaction(async (tx) => {
          const seqId = await allocateChannelMessageSeq(tx, channelId);

          const message = await tx.message.create({
            data: {
              channel_id: channelId,
              sender_id: userId,
              content: content || "",
              message_type: messageType || "text",
              parent_id: parentId,
              seq_id: seqId,
              ...(attachments && attachments.length > 0 && {
                attachments: {
                  create: attachments.map((a) => ({
                    file_url: a.file_url,
                    file_name: a.file_name,
                    file_size: a.file_size,
                    mime_type: a.mime_type,
                  })),
                },
              }),
            },
            include: {
              sender: { select: { id: true, username: true, role: true } },
              parent: { select: { id: true, content: true, sender: { select: { id: true, username: true } } } },
              attachments: true,
              reactions: { select: { id: true, emoji: true, user_id: true, user: { select: { username: true } } } },
            },
          });

          const outboxEvent = await enqueueOutbox(tx, {
            aggregate: "channel",
            aggregateId: channelId,
            event: "receive_message",
            rooms: [`channel:${channelId}`],
            payload: { ...message, tempId },
          });

          return { message, outboxEvent };
        });

        // Fast path: emit now and mark published. If this fails, the relay retries.
        await publishNow(io, outboxEvent);

        // Mentions are resolved against the parent batch's members
        const mentionedIds = content ? await parseMentions(content, channel.batch_id) : [];
        for (const targetId of mentionedIds) {
          if (targetId === userId) continue;
          const notif = await prisma.notification.create({
            data: {
              user_id: targetId,
              type: "mention",
              ref_id: message.id,
              sender_id: userId,
              content_preview: content || "",
            },
          });
          io.to(`user:${targetId}`).emit("notify_user", notif);
        }
      } catch (err) {
        console.error("send_message error:", err);
      }
    });

    // ── Reactions ──────────────────────────────────────
    socket.on("toggle_reaction", async (data) => {
      try {
        const { messageId, emoji } = data;
        if (!messageId || !emoji) return;

        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message) return;

        const existing = await prisma.messageReaction.findUnique({
          where: { message_id_user_id_emoji: { message_id: messageId, user_id: userId, emoji } },
        });

        if (existing) {
          await prisma.messageReaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.messageReaction.create({
            data: { message_id: messageId, user_id: userId, emoji },
          });
        }

        const reactions = await prisma.messageReaction.findMany({
          where: { message_id: messageId },
          select: { id: true, emoji: true, user_id: true, user: { select: { username: true } } },
        });

        io.to(`channel:${message.channel_id}`).emit("reaction_updated", { messageId, reactions });
      } catch (err) {
        console.error("toggle_reaction error:", err);
      }
    });

    socket.on("typing_start", (data) => {
      try {
        const { channelId } = socketJoinChannelSchema.parse(data);
        redisSet(`typing:${channelId}:${userId}`, "1", 5);
        socket.to(`channel:${channelId}`).emit("typing_indicator", { userId, username, channelId, typing: true });
      } catch (err) {}
    });

    socket.on("typing_stop", (data) => {
      try {
        const { channelId } = socketJoinChannelSchema.parse(data);
        redisDel(`typing:${channelId}:${userId}`);
        socket.to(`channel:${channelId}`).emit("typing_indicator", { userId, username, channelId, typing: false });
      } catch (err) {}
    });

    socket.on("mark_read", async (data) => {
      try {
        await prisma.notification.updateMany({
          where: { id: data.notificationId, user_id: userId },
          data: { is_read: true },
        });
        socket.emit("notification_read", { notificationId: data.notificationId });
      } catch (err) {}
    });

    // ── DM Events (unchanged) ───────────────────────────
    socket.on("join_dm", (data) => {
      try {
        const { conversationId } = socketJoinDmSchema.parse(data);
        socket.join(`dm:${conversationId}`);
      } catch (err) {}
    });

    socket.on("leave_dm", (data) => {
      try {
        const { conversationId } = socketJoinDmSchema.parse(data);
        socket.leave(`dm:${conversationId}`);
      } catch (err) {}
    });

    socket.on("send_dm", async (data) => {
      try {
        const { conversationId, content, tempId, attachments } = socketSendDmSchema.parse(data);

        // Message + outbox event commit atomically inside sendDirectMessage.
        const { message, outboxEvent, otherId } = await sendDirectMessage(
          conversationId,
          userId,
          content?.trim(),
          attachments,
          tempId
        );

        // Fast path: deliver now and mark published (relay retries on failure).
        await publishNow(io, outboxEvent);

        try {
          const notif = await prisma.notification.create({
            data: {
              user_id: otherId,
              type: "new_message",
              ref_id: message.id,
              sender_id: userId,
              content_preview: content?.trim() || "Sent an attachment",
            },
          });
          io.to(`user:${otherId}`).emit("notify_user", notif);
        } catch (notifErr) {
          console.error("DM notification error:", notifErr);
        }
      } catch (err) {
        console.error("send_dm error:", err);
      }
    });

    socket.on("mark_dm_read", async (data) => {
      try {
        const { conversationId } = socketJoinDmSchema.parse(data);

        await prisma.directMessage.updateMany({
          where: { conversation_id: conversationId, sender_id: { not: userId }, is_read: false },
          data: { is_read: true },
        });

        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conv) {
          const otherId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
          io.to(`user:${otherId}`).to(`dm:${conversationId}`).emit("dm_read", { conversationId, readBy: userId });
        }
      } catch (err) {
        console.error("mark_dm_read error:", err);
      }
    });

    socket.on("dm_typing_start", (data) => {
      try {
        const { conversationId } = socketJoinDmSchema.parse(data);
        socket.to(`dm:${conversationId}`).emit("dm_typing", { conversationId, userId, username, typing: true });
      } catch (err) {}
    });

    socket.on("dm_typing_stop", (data) => {
      try {
        const { conversationId } = socketJoinDmSchema.parse(data);
        socket.to(`dm:${conversationId}`).emit("dm_typing", { conversationId, userId, username, typing: false });
      } catch (err) {}
    });

    socket.on("disconnect", () => {
      clearInterval(heartbeatInterval);
      redisDel(`user:online:${userId}`);
      incrementCounter("socket_connections_total", { event: "disconnect" });
      io.emit("user_offline", { userId });
      console.log(`🔌 Socket disconnected: ${username}`);
    });
  });
}
