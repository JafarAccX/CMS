import { useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "../store/authStore";
import { useMessageStore } from "../store/messageStore";
import { useNotificationStore } from "../store/notificationStore";
import { useUiStore } from "../store/uiStore";
import { useDmStore } from "../store/dmStore";
import { useSocketStore } from "../store/socketStore";
import { toast } from "react-hot-toast";
import api from "../api/client";
import { isEmbed, requestParentReauth } from "../embed/bridge";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

export function useSocketInit() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const socket = useSocketStore((s) => s.socket);
  const setSocket = useSocketStore((s) => s.setSocket);
  const setIsConnected = useSocketStore((s) => s.setIsConnected);

  useEffect(() => {
    if (!accessToken) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    if (socket) {
      if (socket.auth && (socket.auth as any).token !== accessToken) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      } else {
        return;
      }
    }

    const cleanToken = accessToken.startsWith("Bearer ") ? accessToken.slice(7) : accessToken;

    // Throttle the token-refresh attempt triggered by socket auth failures.
    // Without this, an unrefreshable token + infinite reconnection fires an
    // /auth/me request on every single connect_error (a request storm).
    let lastRefreshAttempt = 0;

    const newSocket = io(SOCKET_URL, {
      auth: { token: cleanToken },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
    });

    newSocket.on("connect", () => {
      console.log("🔌 Socket connected:", newSocket.id);
      setIsConnected(true);

      const { activeChannelId, activeConversationId } = useSocketStore.getState();
      if (activeChannelId) newSocket.emit("join_channel", { channelId: activeChannelId });
      if (activeConversationId) newSocket.emit("join_dm", { conversationId: activeConversationId });
    });

    newSocket.on("connect_error", async (err) => {
      console.error("🔌 Socket connection error:", err.message);
      setIsConnected(false);

      if (err.message.includes("Invalid token") || err.message.includes("No token provided")) {
        // Embedded in the LMS: ask the parent to re-supply credentials instead
        // of relying on the refresh cookie (blocked third-party in the iframe).
        // requestParentReauth is itself throttled, so this is safe to call here.
        if (isEmbed()) {
          requestParentReauth();
          return;
        }
        // At most one refresh attempt per 30s. A successful refresh updates the
        // store token, which recreates the socket with a fresh token; a failed
        // one bounces to login via the axios interceptor.
        const now = Date.now();
        if (now - lastRefreshAttempt < 30_000) return;
        lastRefreshAttempt = now;
        try {
          await api.get("/auth/me");
        } catch (refreshErr) {
          console.error("Socket token refresh failed", refreshErr);
        }
      }
    });

    newSocket.on("disconnect", (reason) => {
      console.log("🔌 Socket disconnected:", reason);
      setIsConnected(false);
    });

    // ── Channel Messages ──────────────────────────────────
    newSocket.on("receive_message", (message) => {
      useMessageStore.getState().appendMessage(message.channel_id, message);
    });

    newSocket.on("reaction_updated", ({ messageId, reactions }) => {
      const allMessages = useMessageStore.getState().messages;
      for (const channelId of Object.keys(allMessages)) {
        const found = allMessages[channelId]?.find((m) => m.id === messageId);
        if (found) {
          useMessageStore.getState().updateReactions(channelId, messageId, reactions);
          break;
        }
      }
    });

    newSocket.on("typing_indicator", ({ userId, username, channelId, typing }) => {
      if (typing) {
        useUiStore.getState().addTypingUser(channelId, userId, username);
      } else {
        useUiStore.getState().removeTypingUser(channelId, userId);
      }
    });

    // ── Notifications ──────────────────────────────────
    const lastNotified = { id: "", time: 0 };
    newSocket.on("notify_user", (notification) => {
      const now = Date.now();
      if (lastNotified.id === notification.ref_id && now - lastNotified.time < 2000) return;
      lastNotified.id = notification.ref_id;
      lastNotified.time = now;

      useNotificationStore.getState().addNotification(notification);
      const typeLabel = notification.type.replace("_", " ");
      toast(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} received!`, { icon: "🔔" });
    });

    // ── DM Messages ──────────────────────────────────
    newSocket.on("receive_dm", (message) => {
      const currentUserId = useAuthStore.getState().user?.id;
      if (message.sender_id === currentUserId) {
        const { activeConversationId } = useSocketStore.getState();
        if (activeConversationId === message.conversation_id) {
          useDmStore.getState().appendMessage(message.conversation_id, message);
          useDmStore.getState().updateConversationPreview(message.conversation_id, message);
          return;
        }
      }
      useDmStore.getState().appendMessage(message.conversation_id, message);
      useDmStore.getState().updateConversationPreview(message.conversation_id, message);
    });

    newSocket.on("dm_typing", ({ conversationId, userId, username, typing }) => {
      if (typing) useUiStore.getState().addDmTypingUser(conversationId, userId, username);
      else useUiStore.getState().removeDmTypingUser(conversationId, userId);
    });

    newSocket.on("dm_read", ({ conversationId }) => {
      useDmStore.getState().markMessagesRead(conversationId);
    });

    newSocket.on("user_online", ({ userId }) => useUiStore.getState().setUserOnline(userId));
    newSocket.on("user_offline", ({ userId }) => useUiStore.getState().setUserOffline(userId));

    setSocket(newSocket);

    return () => {
      // keep socket alive across navigation
    };
  }, [accessToken, socket, setSocket, setIsConnected]);
}

export function useSocket() {
  const socket = useSocketStore((s) => s.socket);
  const isConnected = useSocketStore((s) => s.isConnected);
  const setActiveChannelId = useSocketStore((s) => s.setActiveChannelId);
  const setActiveConversationId = useSocketStore((s) => s.setActiveConversationId);

  const joinChannel = useCallback(
    (channelId: string) => {
      setActiveChannelId(channelId);
      if (socket?.connected) socket.emit("join_channel", { channelId });
    },
    [socket, setActiveChannelId]
  );

  const leaveChannel = useCallback(
    (channelId: string) => {
      setActiveChannelId(null);
      socket?.emit("leave_channel", { channelId });
    },
    [socket, setActiveChannelId]
  );

  const sendMessage = useCallback(
    (channelId: string, content: string, messageType?: string, parentId?: string, tempId?: string, attachments?: any[]) => {
      socket?.emit("send_message", { channelId, content, messageType, parentId, tempId, attachments });
    },
    [socket]
  );

  const startTyping = useCallback((channelId: string) => socket?.emit("typing_start", { channelId }), [socket]);
  const stopTyping = useCallback((channelId: string) => socket?.emit("typing_stop", { channelId }), [socket]);

  const joinDm = useCallback(
    (conversationId: string) => {
      setActiveConversationId(conversationId);
      if (socket?.connected) socket.emit("join_dm", { conversationId });
    },
    [socket, setActiveConversationId]
  );

  const leaveDm = useCallback(
    (conversationId: string) => {
      setActiveConversationId(null);
      socket?.emit("leave_dm", { conversationId });
    },
    [socket, setActiveConversationId]
  );

  const sendDm = useCallback(
    (conversationId: string, content: string, tempId?: string, attachments?: any[]) => {
      socket?.emit("send_dm", { conversationId, content, tempId, attachments });
    },
    [socket]
  );

  const startDmTyping = useCallback((conversationId: string) => socket?.emit("dm_typing_start", { conversationId }), [socket]);
  const stopDmTyping = useCallback((conversationId: string) => socket?.emit("dm_typing_stop", { conversationId }), [socket]);

  const markDmRead = useCallback(
    (conversationId: string) => {
      socket?.emit("mark_dm_read", { conversationId });
      useDmStore.getState().markConversationRead(conversationId);
    },
    [socket]
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => socket?.emit("toggle_reaction", { messageId, emoji }),
    [socket]
  );

  return {
    joinChannel,
    leaveChannel,
    sendMessage,
    startTyping,
    stopTyping,
    joinDm,
    leaveDm,
    sendDm,
    startDmTyping,
    stopDmTyping,
    markDmRead,
    toggleReaction,
    isConnected,
    socket,
  };
}
