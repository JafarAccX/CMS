import { create } from "zustand";

interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  is_deleted: boolean;
  parent_id: string | null;
  created_at: string;
  sender: { id: string; username: string; role: string };
  attachments: { id: string; file_url: string; file_name: string; file_size: number; mime_type: string }[];
  reactions?: { id: string; emoji: string; user_id: string; user: { username: string } }[];
  parent?: { id: string; content: string; sender: { id: string; username: string } } | null;
  isOptimistic?: boolean;
  tempId?: string;
}

interface MessageState {
  messages: Record<string, Message[]>;
  setMessages: (channelId: string, msgs: Message[]) => void;
  appendMessage: (channelId: string, msg: Message) => void;
  prependMessages: (channelId: string, msgs: Message[]) => void;
  softDelete: (channelId: string, messageId: string) => void;
  addOptimisticMessage: (channelId: string, msg: Message) => void;
  removeOptimisticMessage: (channelId: string, tempId: string) => void;
  updateReactions: (channelId: string, messageId: string, reactions: any[]) => void;
  reset: () => void;
}

export const useCmsMessageStore = create<MessageState>()((set) => ({
  messages: {},

  setMessages: (channelId, msgs) =>
    set((state) => ({ messages: { ...state.messages, [channelId]: msgs } })),

  appendMessage: (channelId, msg) =>
    set((state) => {
      const current = state.messages[channelId] || [];
      const filtered = current.filter((m) => !m.isOptimistic || m.tempId !== msg.tempId);
      if (filtered.some((m) => m.id === msg.id)) return state;
      return { messages: { ...state.messages, [channelId]: [...filtered, msg] } };
    }),

  addOptimisticMessage: (channelId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), { ...msg, isOptimistic: true }],
      },
    })),

  removeOptimisticMessage: (channelId, tempId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).filter((m) => m.tempId !== tempId),
      },
    })),

  prependMessages: (channelId, msgs) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: [...msgs, ...(state.messages[channelId] || [])],
      },
    })),

  softDelete: (channelId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, content: "" } : m
        ),
      },
    })),

  updateReactions: (channelId, messageId, reactions) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, reactions } : m
        ),
      },
    })),

  // Called by CommunityShell on unmount — prevents previous batch messages
  // from flashing when the user navigates away and back to /community.
  reset: () => set({ messages: {} }),
}));
