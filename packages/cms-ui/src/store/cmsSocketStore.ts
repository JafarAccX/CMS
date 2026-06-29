import { create } from "zustand";
import { Socket } from "socket.io-client";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  activeChannelId: string | null;
  activeConversationId: string | null;
}

interface SocketActions {
  setSocket: (socket: Socket | null) => void;
  setIsConnected: (connected: boolean) => void;
  setActiveChannelId: (id: string | null) => void;
  setActiveConversationId: (id: string | null) => void;
  // Fully tears down the socket. Null-safe: called by module-level lms:logout
  // listener even when user has never visited /community (socket === null).
  destroySocket: () => void;
}

export const useCmsSocketStore = create<SocketState & SocketActions>()((set, get) => ({
  socket: null,
  isConnected: false,
  activeChannelId: null,
  activeConversationId: null,

  setSocket: (socket) => set({ socket }),
  setIsConnected: (isConnected) => set({ isConnected }),
  setActiveChannelId: (activeChannelId) => set({ activeChannelId }),
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),

  destroySocket: () => {
    const { socket } = get();
    if (socket) {
      // Order is non-negotiable: removeAllListeners() FIRST strips handlers
      // so the 'disconnect' event doesn't fire into dead React state.
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({
      socket: null,
      isConnected: false,
      activeChannelId: null,
      activeConversationId: null,
    });
  },
}));
