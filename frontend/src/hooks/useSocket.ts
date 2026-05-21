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

    // If socket exists but token changed, we need to reconnect
    if (socket) {
      if (socket.auth && (socket.auth as any).token !== accessToken) {
         socket.disconnect();
         setSocket(null);
         setIsConnected(false);
      } else {
         return; // Token is same, no need to reconnect
      }
    }

    const cleanToken = accessToken.startsWith("Bearer ") ? accessToken.slice(7) : accessToken;

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
      
      const { activeBatchId, activeConversationId } = useSocketStore.getState();
      if (activeBatchId) newSocket.emit("join_batch", { batchId: activeBatchId });
      if (activeConversationId) newSocket.emit("join_dm", { conversationId: activeConversationId });
    });

    newSocket.on("connect_error", async (err) => {
      console.error("🔌 Socket connection error:", err.message);
      setIsConnected(false);
      
      if (err.message.includes("Invalid token") || err.message.includes("No token provided")) {
        try {
          // Trigger a dummy authenticated request to invoke the Axios response interceptor.
          // The interceptor will catch the 401, refresh the token, update useAuthStore,
          // and this useEffect will re-run with the new accessToken.
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

    // ── Batch Messages ──────────────────────────────────
    newSocket.on("receive_message", (message) => {
      useMessageStore.getState().appendMessage(message.batch_id, message);
    });

    newSocket.on("reaction_updated", ({ messageId, reactions }) => {
      // Find which batch this message belongs to and update
      const allMessages = useMessageStore.getState().messages;
      for (const batchId of Object.keys(allMessages)) {
        const found = allMessages[batchId]?.find(m => m.id === messageId);
        if (found) {
          useMessageStore.getState().updateReactions(batchId, messageId, reactions);
          break;
        }
      }
    });

    newSocket.on("typing_indicator", ({ userId, username, batchId, typing }) => {
      if (typing) {
        useUiStore.getState().addTypingUser(batchId, userId, username);
      } else {
        useUiStore.getState().removeTypingUser(batchId, userId);
      }
    });

    // ── Notifications ──────────────────────────────────
    const lastNotified = { id: "", time: 0 };
    newSocket.on("notify_user", (notification) => {
      const now = Date.now();
      if (lastNotified.id === notification.ref_id && (now - lastNotified.time) < 2000) {
        return;
      }
      lastNotified.id = notification.ref_id;
      lastNotified.time = now;

      useNotificationStore.getState().addNotification(notification);
      const typeLabel = notification.type.replace("_", " ");
      toast(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} received!`, { icon: "🔔" });
    });

    // ── DM Messages ──────────────────────────────────
    newSocket.on("receive_dm", (message) => {
      const currentUserId = useAuthStore.getState().user?.id;
      
      // Skip if this is our own message (we already have optimistic version)
      // But only skip if we're the sender AND we're in the DM room
      if (message.sender_id === currentUserId) {
        const { activeConversationId } = useSocketStore.getState();
        if (activeConversationId === message.conversation_id) {
          // We're in the room - the optimistic message is already shown
          // Still need to reconcile by replacing optimistic with real
          useDmStore.getState().appendMessage(message.conversation_id, message);
          useDmStore.getState().updateConversationPreview(message.conversation_id, message);
          return;
        }
      }
      
      useDmStore.getState().appendMessage(message.conversation_id, message);
      useDmStore.getState().updateConversationPreview(message.conversation_id, message);
    });

    // ── DM Typing ──────────────────────────────────
    newSocket.on("dm_typing", ({ conversationId, userId, username, typing }) => {
      if (typing) {
        useUiStore.getState().addDmTypingUser(conversationId, userId, username);
      } else {
        useUiStore.getState().removeDmTypingUser(conversationId, userId);
      }
    });

    // ── DM Read Receipts ──────────────────────────────
    newSocket.on("dm_read", ({ conversationId }) => {
      useDmStore.getState().markMessagesRead(conversationId);
    });

    // ── Online Status ──────────────────────────────────
    newSocket.on("user_online", ({ userId }) => {
      useUiStore.getState().setUserOnline(userId);
    });

    newSocket.on("user_offline", ({ userId }) => {
      useUiStore.getState().setUserOffline(userId);
    });

    setSocket(newSocket);

    return () => {
      // Keep socket alive across navigation
    };
  }, [accessToken, socket, setSocket, setIsConnected]);
}

export function useSocket() {
  const socket = useSocketStore((s) => s.socket);
  const isConnected = useSocketStore((s) => s.isConnected);
  const setActiveBatchId = useSocketStore((s) => s.setActiveBatchId);
  const setActiveConversationId = useSocketStore((s) => s.setActiveConversationId);

  const joinBatch = useCallback((batchId: string) => {
    setActiveBatchId(batchId);
    if (socket?.connected) {
      socket.emit("join_batch", { batchId });
    }
  }, [socket, setActiveBatchId]);

  const leaveBatch = useCallback((batchId: string) => {
    setActiveBatchId(null);
    socket?.emit("leave_batch", { batchId });
  }, [socket, setActiveBatchId]);

  const sendMessage = useCallback((batchId: string, content: string, messageType?: string, parentId?: string, tempId?: string, attachments?: any[]) => {
    socket?.emit("send_message", { batchId, content, messageType, parentId, tempId, attachments });
  }, [socket]);

  const startTyping = useCallback((batchId: string) => {
    socket?.emit("typing_start", { batchId });
  }, [socket]);

  const stopTyping = useCallback((batchId: string) => {
    socket?.emit("typing_stop", { batchId });
  }, [socket]);

  const joinDm = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    if (socket?.connected) {
      socket.emit("join_dm", { conversationId });
    }
  }, [socket, setActiveConversationId]);

  const leaveDm = useCallback((conversationId: string) => {
    setActiveConversationId(null);
    socket?.emit("leave_dm", { conversationId });
  }, [socket, setActiveConversationId]);

  const sendDm = useCallback((conversationId: string, content: string, tempId?: string, attachments?: any[]) => {
    socket?.emit("send_dm", { conversationId, content, tempId, attachments });
  }, [socket]);

  const startDmTyping = useCallback((conversationId: string) => {
    socket?.emit("dm_typing_start", { conversationId });
  }, [socket]);

  const stopDmTyping = useCallback((conversationId: string) => {
    socket?.emit("dm_typing_stop", { conversationId });
  }, [socket]);

  const markDmRead = useCallback((conversationId: string) => {
    socket?.emit("mark_dm_read", { conversationId });
    useDmStore.getState().markConversationRead(conversationId);
  }, [socket]);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    socket?.emit("toggle_reaction", { messageId, emoji });
  }, [socket]);

  return {
    joinBatch, leaveBatch, sendMessage, startTyping, stopTyping,
    joinDm, leaveDm, sendDm, startDmTyping, stopDmTyping, markDmRead,
    toggleReaction,
    isConnected,
    socket
  };
}
