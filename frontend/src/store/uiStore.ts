import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

/** Reflect the active theme onto <html data-theme> so the CSS variables flip. */
function applyThemeToDom(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

interface UiState {
  // Theme (persisted)
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  setRightPanel: (open: boolean) => void;
  
  // Batch typing indicators
  typingUsers: Record<string, { userId: string; username: string }[]>;
  addTypingUser: (batchId: string, userId: string, username: string) => void;
  removeTypingUser: (batchId: string, userId: string) => void;
  
  // DM typing indicators
  dmTypingUsers: Record<string, { userId: string; username: string }[]>;
  addDmTypingUser: (convId: string, userId: string, username: string) => void;
  removeDmTypingUser: (convId: string, userId: string) => void;
  
  // Online status tracking
  onlineUsers: Set<string>;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  isUserOnline: (userId: string) => boolean;
  setOnlineUsers: (userIds: string[]) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
  // Theme
  theme: "dark" as Theme,
  setTheme: (theme) => {
    applyThemeToDom(theme);
    set({ theme });
  },
  toggleTheme: () => {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },

  rightPanelOpen: true,
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanel: (open) => set({ rightPanelOpen: open }),

  // Batch typing
  typingUsers: {},
  addTypingUser: (batchId, userId, username) =>
    set((state) => {
      const current = state.typingUsers[batchId] || [];
      if (current.some((u) => u.userId === userId)) return state;
      return { typingUsers: { ...state.typingUsers, [batchId]: [...current, { userId, username }] } };
    }),
  removeTypingUser: (batchId, userId) =>
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [batchId]: (state.typingUsers[batchId] || []).filter((u) => u.userId !== userId),
      },
    })),

  // DM typing
  dmTypingUsers: {},
  addDmTypingUser: (convId, userId, username) =>
    set((state) => {
      const current = state.dmTypingUsers[convId] || [];
      if (current.some((u) => u.userId === userId)) return state;
      return { dmTypingUsers: { ...state.dmTypingUsers, [convId]: [...current, { userId, username }] } };
    }),
  removeDmTypingUser: (convId, userId) =>
    set((state) => ({
      dmTypingUsers: {
        ...state.dmTypingUsers,
        [convId]: (state.dmTypingUsers[convId] || []).filter((u) => u.userId !== userId),
      },
    })),

  // Online status
  onlineUsers: new Set<string>(),
  setUserOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),
  setUserOffline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),
  isUserOnline: (userId) => get().onlineUsers.has(userId),
  setOnlineUsers: (userIds) => set({ onlineUsers: new Set(userIds) }),
    }),
    {
      name: "cms-ui",
      // Only the theme is persisted; transient socket/typing state is not.
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeToDom(state.theme);
      },
    }
  )
);
