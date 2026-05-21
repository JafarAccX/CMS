import { Server } from "socket.io";
import { verifyAccessToken } from "../utils/jwt.js";
import prisma from "../utils/prisma.js";
import { canSendMessage } from "../utils/permissions.js";
import { socketSendMessageSchema, socketJoinBatchSchema, socketSendDmSchema, socketJoinDmSchema } from "../validators/index.js";
import { redisSet, redisDel } from "../utils/redis.js";
import { parseMentions } from "../services/message.service.js";
import { sendDirectMessage } from "../services/dm.service.js";

interface ServerToClientEvents {
  receive_message: (message: any) => void;
  user_joined: (data: { userId: string; username: string }) => void;
  user_left: (data: { userId: string; username: string }) => void;
  typing_indicator: (data: { userId: string; username: string; batchId: string; typing: boolean }) => void;
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
  join_batch: (data: { batchId: string }) => void;
  leave_batch: (data: { batchId: string }) => void;
  send_message: (data: { batchId: string; content?: string; messageType?: "text" | "file" | "system"; parentId?: string; tempId?: string; attachments?: AttachmentPayload[] }) => void;
  typing_start: (data: { batchId: string }) => void;
  typing_stop: (data: { batchId: string }) => void;
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

export function initSockets(io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) {
  // Middleware for authentication
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
    console.log(`🔌 Socket connected: ${username} (${socket.id})`);

    // Join personal room for private notifications
    socket.join(`user:${userId}`);
    
    // Set online status & broadcast
    redisSet(`user:online:${userId}`, "1", 30);
    io.emit("user_online", { userId });
    
    // Heartbeat: refresh online status every 15s
    const heartbeatInterval = setInterval(() => {
      redisSet(`user:online:${userId}`, "1", 30);
    }, 15000);

    // ── Batch Events ────────────────────────────────────
    socket.on("join_batch", async (data) => {
      try {
        const { batchId } = socketJoinBatchSchema.parse(data);
        socket.join(batchId);
        io.to(batchId).emit("user_joined", { userId, username });
      } catch (err) {
        console.error("join_batch error:", err);
      }
    });

    socket.on("leave_batch", (data) => {
      try {
        const { batchId } = socketJoinBatchSchema.parse(data);
        socket.leave(batchId);
        io.to(batchId).emit("user_left", { userId, username });
      } catch (err) {
        console.error("leave_batch error:", err);
      }
    });

    socket.on("send_message", async (data) => {
      try {
        const { batchId, content, messageType, parentId, tempId, attachments } = socketSendMessageSchema.parse(data);

        // Access check
        const [user, batch, membership] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: userId } }),
          prisma.batch.findUniqueOrThrow({ where: { id: batchId }, include: { batch_settings: true } }),
          prisma.membership.findUnique({ where: { user_id_batch_id: { user_id: userId, batch_id: batchId } } }),
        ]);

        if (!canSendMessage(user, batch, membership)) {
          console.warn(`🚫 User ${username} permission denied for batch ${batchId}`);
          return;
        }

        // Persist message
        const message = await prisma.message.create({
          data: {
            batch_id: batchId,
            sender_id: userId,
            content: content || "",
            message_type: messageType || "text",
            parent_id: parentId,
            ...(attachments && attachments.length > 0 && {
              attachments: {
                create: attachments.map(a => ({
                  file_url: a.file_url,
                  file_name: a.file_name,
                  file_size: a.file_size,
                  mime_type: a.mime_type
                }))
              }
            })
          },
          include: {
            sender: { select: { id: true, username: true, role: true } },
            parent: { select: { id: true, content: true, sender: { select: { id: true, username: true } } } },
            attachments: true,
            reactions: { select: { id: true, emoji: true, user_id: true, user: { select: { username: true } } } },
          },
        });

        // Broadcast to batch
        io.to(batchId).emit("receive_message", { ...message, tempId });

        // Handle mentions
        const mentionedIds = content ? await parseMentions(content, batchId) : [];
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

    // ── Emoji Reactions ──────────────────────────────────
    socket.on("toggle_reaction", async (data) => {
      try {
        const { messageId, emoji } = data;
        if (!messageId || !emoji) return;

        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message) return;

        // Check if reaction already exists
        const existing = await prisma.messageReaction.findUnique({
          where: { message_id_user_id_emoji: { message_id: messageId, user_id: userId, emoji } }
        });

        if (existing) {
          await prisma.messageReaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.messageReaction.create({
            data: { message_id: messageId, user_id: userId, emoji }
          });
        }

        // Fetch updated reactions for this message
        const reactions = await prisma.messageReaction.findMany({
          where: { message_id: messageId },
          select: { id: true, emoji: true, user_id: true, user: { select: { username: true } } }
        });

        io.to(message.batch_id).emit("reaction_updated", { messageId, reactions });
      } catch (err) {
        console.error("toggle_reaction error:", err);
      }
    });

    socket.on("typing_start", (data) => {
      try {
        const { batchId } = socketJoinBatchSchema.parse(data);
        redisSet(`typing:${batchId}:${userId}`, "1", 5);
        socket.to(batchId).emit("typing_indicator", { userId, username, batchId, typing: true });
      } catch (err) {}
    });

    socket.on("typing_stop", (data) => {
      try {
        const { batchId } = socketJoinBatchSchema.parse(data);
        redisDel(`typing:${batchId}:${userId}`);
        socket.to(batchId).emit("typing_indicator", { userId, username, batchId, typing: false });
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

    // ── DM Events ────────────────────────────────────────
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
        
        const message = await sendDirectMessage(conversationId, userId, content?.trim(), attachments);
        
        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conv) {
          const otherId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
          
          // Broadcast to DM room + other user's personal room (NOT sender's personal room)
          // Sender already has optimistic message; DM room broadcast reaches sender if they're in it
          io.to(`dm:${conversationId}`).to(`user:${otherId}`).emit("receive_dm", { ...message, tempId });
          
          // Create notification for the other user
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
        }
      } catch (err) {
        console.error("send_dm error:", err);
      }
    });

    // Mark DM conversation as read
    socket.on("mark_dm_read", async (data) => {
      try {
        const { conversationId } = socketJoinDmSchema.parse(data);
        
        await prisma.directMessage.updateMany({
          where: { conversation_id: conversationId, sender_id: { not: userId }, is_read: false },
          data: { is_read: true },
        });
        
        // Notify the other user that their messages were read
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
      io.emit("user_offline", { userId });
      console.log(`🔌 Socket disconnected: ${username}`);
    });
  });
}
