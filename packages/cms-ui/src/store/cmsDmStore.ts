import { create } from "zustand";

interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender: { id: string; username: string; role: string };
  attachments?: { id: string; file_url: string; file_name: string; file_size: number; mime_type: string }[];
  isOptimistic?: boolean;
  tempId?: string;
}

interface ConversationPreview {
  id: string;
  otherUser: { id: string; username: string; role: string };
  lastMessage: { id: string; content: string; sender_id: string; is_read: boolean; created_at: string } | null;
  unreadCount: number;
  updated_at: string;
}

interface CmsDmState {
  conversations: ConversationPreview[];
  messages: Record<string, DmMessage[]>;
  activeConversationId: string | null;
  setConversations: (convs: ConversationPreview[]) => void;
  setMessages: (convId: string, msgs: DmMessage[]) => void;
  appendMessage: (convId: string, msg: DmMessage) => void;
  setActive: (id: string | null) => void;
  updateConversationPreview: (convId: string, msg: DmMessage) => void;
  addOptimisticMessage: (convId: string, msg: DmMessage) => void;
  removeOptimisticMessage: (convId: string, tempId: string) => void;
  markConversationRead: (convId: string) => void;
  markMessagesRead: (convId: string) => void;
  reset: () => void;
}

export const useCmsDmStore = create<CmsDmState>()((set) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,
  setConversations: (convs) => set({ conversations: convs }),
  setMessages: (convId, msgs) => set((state) => ({ messages: { ...state.messages, [convId]: msgs } })),
  appendMessage: (convId, msg) =>
    set((state) => {
      const existing = state.messages[convId] || [];
      const filtered = existing.filter((m) => !(m.isOptimistic && m.tempId === msg.tempId));
      if (filtered.some((m) => m.id === msg.id)) return state;
      return { messages: { ...state.messages, [convId]: [...filtered, msg] } };
    }),
  addOptimisticMessage: (convId, msg) =>
    set((state) => ({ messages: { ...state.messages, [convId]: [...(state.messages[convId] || []), { ...msg, isOptimistic: true }] } })),
  removeOptimisticMessage: (convId, tempId) =>
    set((state) => ({ messages: { ...state.messages, [convId]: (state.messages[convId] || []).filter((m) => m.tempId !== tempId) } })),
  setActive: (id) => set({ activeConversationId: id }),
  updateConversationPreview: (convId, msg) =>
    set((state) => ({
      conversations: state.conversations
        .map((c) => c.id === convId ? { ...c, lastMessage: { id: msg.id, content: msg.content, sender_id: msg.sender_id, is_read: msg.is_read, created_at: msg.created_at }, updated_at: msg.created_at } : c)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    })),
  markConversationRead: (convId) =>
    set((state) => ({ conversations: state.conversations.map((c) => c.id === convId ? { ...c, unreadCount: 0 } : c) })),
  markMessagesRead: (convId) =>
    set((state) => ({ messages: { ...state.messages, [convId]: (state.messages[convId] || []).map((m) => ({ ...m, is_read: true })) } })),
  reset: () => set({ conversations: [], messages: {}, activeConversationId: null }),
}));
