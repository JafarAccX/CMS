import { create } from "zustand";
import { Socket } from "socket.io-client";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  activeBatchId: string | null;
  activeConversationId: string | null;
}

interface SocketActions {
  setSocket: (socket: Socket | null) => void;
  setIsConnected: (connected: boolean) => void;
  setActiveBatchId: (id: string | null) => void;
  setActiveConversationId: (id: string | null) => void;
}

export const useSocketStore = create<SocketState & SocketActions>()((set) => ({
  socket: null,
  isConnected: false,
  activeBatchId: null,
  activeConversationId: null,
  setSocket: (socket) => set({ socket }),
  setIsConnected: (isConnected) => set({ isConnected }),
  setActiveBatchId: (activeBatchId) => set({ activeBatchId }),
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
}));
