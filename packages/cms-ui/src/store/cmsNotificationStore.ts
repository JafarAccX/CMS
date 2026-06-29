import { create } from "zustand";

interface CmsNotification {
  id: string;
  user_id: string;
  type: string;
  ref_id: string | null;
  content_preview?: string | null;
  is_read: boolean;
  created_at: string;
}

interface CmsNotificationState {
  notifications: CmsNotification[];
  unreadCount: number;
  setNotifications: (notifs: CmsNotification[]) => void;
  addNotification: (notif: CmsNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  reset: () => void;
}

export const useCmsNotificationStore = create<CmsNotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifs) => {
    const arr = Array.isArray(notifs) ? notifs : [];
    set({ notifications: arr, unreadCount: arr.filter((n) => !n.is_read).length });
  },
  addNotification: (notif) =>
    set((state) => ({ notifications: [notif, ...state.notifications], unreadCount: state.unreadCount + (notif.is_read ? 0 : 1) })),
  markRead: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      const decrement = target && !target.is_read ? 1 : 0;
      return {
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        unreadCount: Math.max(0, state.unreadCount - decrement),
      };
    }),
  markAllRead: () =>
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, is_read: true })), unreadCount: 0 })),
  reset: () => set({ notifications: [], unreadCount: 0 }),
}));
