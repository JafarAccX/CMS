import { create } from "zustand";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  ref_id: string | null;
  content_preview?: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifs: Notification[]) => void;
  addNotification: (notif: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifs) =>
    set({ notifications: notifs, unreadCount: notifs.filter((n) => !n.is_read).length }),

  addNotification: (notif) =>
    set((state) => ({
      notifications: [notif, ...state.notifications],
      unreadCount: state.unreadCount + (notif.is_read ? 0 : 1),
    })),

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
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    })),
}));
