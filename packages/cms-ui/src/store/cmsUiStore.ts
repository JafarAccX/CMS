import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

function applyThemeToDom(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

interface CmsUiState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  setRightPanel: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  typingUsers: Record<string, { userId: string; username: string }[]>;
  addTypingUser: (batchId: string, userId: string, username: string) => void;
  removeTypingUser: (batchId: string, userId: string) => void;
  dmTypingUsers: Record<string, { userId: string; username: string }[]>;
  addDmTypingUser: (convId: string, userId: string, username: string) => void;
  removeDmTypingUser: (convId: string, userId: string) => void;
  onlineUsers: Set<string>;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  isUserOnline: (userId: string) => boolean;
  setOnlineUsers: (userIds: string[]) => void;
  isEmbed: boolean;
  setIsEmbed: (isEmbed: boolean) => void;
  reset: () => void;
}

export const useCmsUiStore = create<CmsUiState>()(
  persist(
    (set, get) => ({
      theme: "dark" as Theme,
      setTheme: (theme) => { applyThemeToDom(theme); set({ theme }); },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
      rightPanelOpen: true,
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setRightPanel: (open) => set({ rightPanelOpen: open }),
      isSidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      typingUsers: {},
      addTypingUser: (batchId, userId, username) =>
        set((state) => {
          const current = state.typingUsers[batchId] || [];
          if (current.some((u) => u.userId === userId)) return state;
          return { typingUsers: { ...state.typingUsers, [batchId]: [...current, { userId, username }] } };
        }),
      removeTypingUser: (batchId, userId) =>
        set((state) => ({
          typingUsers: { ...state.typingUsers, [batchId]: (state.typingUsers[batchId] || []).filter((u) => u.userId !== userId) },
        })),
      dmTypingUsers: {},
      addDmTypingUser: (convId, userId, username) =>
        set((state) => {
          const current = state.dmTypingUsers[convId] || [];
          if (current.some((u) => u.userId === userId)) return state;
          return { dmTypingUsers: { ...state.dmTypingUsers, [convId]: [...current, { userId, username }] } };
        }),
      removeDmTypingUser: (convId, userId) =>
        set((state) => ({
          dmTypingUsers: { ...state.dmTypingUsers, [convId]: (state.dmTypingUsers[convId] || []).filter((u) => u.userId !== userId) },
        })),
      onlineUsers: new Set<string>(),
      setUserOnline: (userId) => set((state) => { const next = new Set(state.onlineUsers); next.add(userId); return { onlineUsers: next }; }),
      setUserOffline: (userId) => set((state) => { const next = new Set(state.onlineUsers); next.delete(userId); return { onlineUsers: next }; }),
      isUserOnline: (userId) => get().onlineUsers.has(userId),
      setOnlineUsers: (userIds) => set({ onlineUsers: new Set(userIds) }),
      isEmbed: false,
      setIsEmbed: (isEmbed) => set({ isEmbed }),
      reset: () => set({ typingUsers: {}, dmTypingUsers: {}, onlineUsers: new Set() }),
    }),
    {
      name: "cms-ui-store",
      partialize: (s) => ({ theme: s.theme, isSidebarCollapsed: s.isSidebarCollapsed }),
      onRehydrateStorage: () => (state) => { if (state) applyThemeToDom(state.theme); },
    }
  )
);
