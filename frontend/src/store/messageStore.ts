import { create } from "zustand";

interface Message {
  id: string;
  batch_id: string;
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
  setMessages: (batchId: string, msgs: Message[]) => void;
  appendMessage: (batchId: string, msg: Message) => void;
  prependMessages: (batchId: string, msgs: Message[]) => void;
  softDelete: (batchId: string, messageId: string) => void;
  addOptimisticMessage: (batchId: string, msg: Message) => void;
  removeOptimisticMessage: (batchId: string, tempId: string) => void;
  updateReactions: (batchId: string, messageId: string, reactions: any[]) => void;
}

export const useMessageStore = create<MessageState>()((set) => ({
  messages: {},

  setMessages: (batchId, msgs) =>
    set((state) => ({ messages: { ...state.messages, [batchId]: msgs } })),

  appendMessage: (batchId, msg) =>
    set((state) => {
      const current = state.messages[batchId] || [];
      // If we receive the real message, remove any matching optimistic message
      const filtered = current.filter((m) => !m.isOptimistic || m.tempId !== msg.tempId);
      if (filtered.some((m) => m.id === msg.id)) return state;
      return { messages: { ...state.messages, [batchId]: [...filtered, msg] } };
    }),

  addOptimisticMessage: (batchId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [batchId]: [...(state.messages[batchId] || []), { ...msg, isOptimistic: true }],
      },
    })),

  removeOptimisticMessage: (batchId, tempId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [batchId]: (state.messages[batchId] || []).filter((m) => m.tempId !== tempId),
      },
    })),

  prependMessages: (batchId, msgs) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [batchId]: [...msgs, ...(state.messages[batchId] || [])],
      },
    })),

  softDelete: (batchId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [batchId]: (state.messages[batchId] || []).map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, content: "" } : m
        ),
      },
    })),

  updateReactions: (batchId, messageId, reactions) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [batchId]: (state.messages[batchId] || []).map((m) =>
          m.id === messageId ? { ...m, reactions } : m
        ),
      },
    })),
}));
