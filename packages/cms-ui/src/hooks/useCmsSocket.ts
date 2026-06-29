import { useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCmsAuthStore } from "../api/cmsClient";
import { useCmsMessageStore } from "../store/cmsMessageStore";
import { useCmsDmStore } from "../store/cmsDmStore";
import { useCmsNotificationStore } from "../store/cmsNotificationStore";
import { useCmsSocketStore } from "../store/cmsSocketStore";
import { useCmsUiStore } from "../store/cmsUiStore";
import { toast } from "react-hot-toast";

let SOCKET_URL = "http://localhost:4000";

export function configureCmsSocket(url: string) {
  SOCKET_URL = url;
}

export function useCmsSocketInit() {
  const accessToken = useCmsAuthStore((s) => s.accessToken);
  const socket = useCmsSocketStore((s) => s.socket);
  const setSocket = useCmsSocketStore((s) => s.setSocket);
  const setIsConnected = useCmsSocketStore((s) => s.setIsConnected);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) {
      if (socket) {
        useCmsSocketStore.getState().destroySocket();
      }
      return;
    }

    // If a socket exists with the same token, don't recreate it.
    if (socket) {
      if (socket.auth && (socket.auth as Record<string, unknown>).token !== accessToken) {
        useCmsSocketStore.getState().destroySocket();
      } else {
        return;
      }
    }

    const cleanToken = accessToken.startsWith("Bearer ") ? accessToken.slice(7) : accessToken;
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
      setIsConnected(true);
      const { activeChannelId, activeConversationId } = useCmsSocketStore.getState();
      if (activeChannelId) newSocket.emit("join_channel", { channelId: activeChannelId });
      if (activeConversationId) newSocket.emit("join_dm", { conversationId: activeConversationId });
      if (activeChannelId) queryClient.invalidateQueries({ queryKey: ["cms-messages", activeChannelId] });
      if (activeConversationId) queryClient.invalidateQueries({ queryKey: ["cms-dm-messages", activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ["cms-dm-conversations"] });
    });

    newSocket.on("connect_error", async (err) => {
      setIsConnected(false);
      if (err.message.includes("Invalid token") || err.message.includes("No token provided")) {
        const now = Date.now();
        if (now - lastRefreshAttempt < 30_000) return;
        lastRefreshAttempt = now;
        // Attempt silent CMS token refresh
        try {
          await useCmsAuthStore.getState().logout();
        } catch {}
      }
    });

    newSocket.on("disconnect", () => setIsConnected(false));

    // ── Channel events ──────────────────────────────────────────────────────────
    newSocket.on("receive_message", (message) => {
      useCmsMessageStore.getState().appendMessage(message.channel_id, message);
    });

    newSocket.on("reaction_updated", ({ messageId, reactions }) => {
      const allMessages = useCmsMessageStore.getState().messages;
      for (const channelId of Object.keys(allMessages)) {
        const found = allMessages[channelId]?.find((m) => m.id === messageId);
        if (found) {
          useCmsMessageStore.getState().updateReactions(channelId, messageId, reactions);
          break;
        }
      }
    });

    newSocket.on("typing_indicator", ({ userId, username, channelId, typing }) => {
      if (typing) useCmsUiStore.getState().addTypingUser(channelId, userId, username);
      else useCmsUiStore.getState().removeTypingUser(channelId, userId);
    });

    // ── Notifications ───────────────────────────────────────────────────────────
    const lastNotified = { id: "", time: 0 };
    newSocket.on("notify_user", (notification) => {
      const now = Date.now();
      if (lastNotified.id === notification.ref_id && now - lastNotified.time < 2000) return;
      lastNotified.id = notification.ref_id;
      lastNotified.time = now;
      useCmsNotificationStore.getState().addNotification(notification);
      const typeLabel = notification.type.replace("_", " ");
      toast(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} received!`, { icon: "🔔" });
    });

    // ── DM events ───────────────────────────────────────────────────────────────
    newSocket.on("receive_dm", (message) => {
      const currentUserId = useCmsAuthStore.getState().user?.id;
      if (message.sender_id === currentUserId) {
        const { activeConversationId } = useCmsSocketStore.getState();
        if (activeConversationId === message.conversation_id) {
          useCmsDmStore.getState().appendMessage(message.conversation_id, message);
          useCmsDmStore.getState().updateConversationPreview(message.conversation_id, message);
          return;
        }
      }
      useCmsDmStore.getState().appendMessage(message.conversation_id, message);
      useCmsDmStore.getState().updateConversationPreview(message.conversation_id, message);
    });

    newSocket.on("dm_typing", ({ conversationId, userId, username, typing }) => {
      if (typing) useCmsUiStore.getState().addDmTypingUser(conversationId, userId, username);
      else useCmsUiStore.getState().removeDmTypingUser(conversationId, userId);
    });

    newSocket.on("dm_read", ({ conversationId }) => {
      useCmsDmStore.getState().markMessagesRead(conversationId);
    });

    newSocket.on("user_online", ({ userId }) => useCmsUiStore.getState().setUserOnline(userId));
    newSocket.on("user_offline", ({ userId }) => useCmsUiStore.getState().setUserOffline(userId));

    setSocket(newSocket);

    return () => {
      // Keep socket alive across internal sub-navigation.
      // destroySocket() is handled by CommunityShell's unmount cleanup.
    };
  }, [accessToken, socket, setSocket, setIsConnected, queryClient]);
}

export function useCmsSocket() {
  const socket = useCmsSocketStore((s) => s.socket);
  const isConnected = useCmsSocketStore((s) => s.isConnected);
  const setActiveChannelId = useCmsSocketStore((s) => s.setActiveChannelId);
  const setActiveConversationId = useCmsSocketStore((s) => s.setActiveConversationId);

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
    (channelId: string, content: string, messageType?: string, parentId?: string, tempId?: string, attachments?: unknown[]) => {
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
    (conversationId: string, content: string, tempId?: string, attachments?: unknown[]) => {
      socket?.emit("send_dm", { conversationId, content, tempId, attachments });
    },
    [socket]
  );

  const startDmTyping = useCallback((c: string) => socket?.emit("dm_typing_start", { conversationId: c }), [socket]);
  const stopDmTyping = useCallback((c: string) => socket?.emit("dm_typing_stop", { conversationId: c }), [socket]);

  const markDmRead = useCallback(
    (conversationId: string) => {
      socket?.emit("mark_dm_read", { conversationId });
      useCmsDmStore.getState().markConversationRead(conversationId);
    },
    [socket]
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => socket?.emit("toggle_reaction", { messageId, emoji }),
    [socket]
  );

  return {
    joinChannel, leaveChannel, sendMessage,
    startTyping, stopTyping,
    joinDm, leaveDm, sendDm,
    startDmTyping, stopDmTyping,
    markDmRead, toggleReaction,
    isConnected, socket,
  };
}
