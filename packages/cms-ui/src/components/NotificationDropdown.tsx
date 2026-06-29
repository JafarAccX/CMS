import { useState, useRef, useEffect, useMemo } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { useCmsNotificationStore } from "../store/cmsNotificationStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cmsApiClient as api } from "../api/cmsClient";
import { formatDistanceToNow } from "date-fns";

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "mentions">("all");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead } = useCmsNotificationStore();
  const qc = useQueryClient();
  const filteredNotifications = useMemo(() => {
    if (filter === "mentions") return notifications.filter((n) => n.type === "mention");
    if (filter === "unread") return notifications.filter((n) => !n.is_read);
    return notifications;
  }, [filter, notifications]);

  const markAllMut = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => {
      markAllRead();
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: (_, id) => {
      markRead(id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-dim hover:text-primary hover:bg-surface-100 rounded-lg transition-all"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-accent-400 text-white text-[10px] rounded-full flex items-center justify-center animate-pulse font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface-50 border border-hairline rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-fade-in">
          <div className="p-4 border-b border-hairline flex items-center justify-between">
            <h3 className="font-semibold text-sm text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                className="text-xs text-accent-300 hover:text-accent-400 flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="px-4 py-2 border-b border-hairline flex items-center gap-2">
            {[
              { key: "all", label: "All" },
              { key: "unread", label: "Unread" },
              { key: "mentions", label: "Mentions" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key as "all" | "unread" | "mentions")}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  filter === opt.key
                    ? "bg-accent-100 text-accent-300 border-accent-200"
                    : "bg-surface-100 text-dim border-hairline hover:text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {filteredNotifications.length > 0 ? (
              <div className="divide-y divide-hairline">
                {filteredNotifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 hover:bg-surface-100 transition-colors cursor-pointer group ${
                      !n.is_read ? "bg-accent-100/50" : ""
                    }`}
                    onClick={() => !n.is_read && markReadMut.mutate(n.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={`text-sm ${!n.is_read ? "text-primary font-medium" : "text-dim"}`}>
                          <span className="capitalize">{n.type.replace("_", " ")}</span>
                        </p>
                        {n.content_preview && (
                          <p className="text-xs text-faint line-clamp-2 mt-1 italic">
                            "{n.content_preview}"
                          </p>
                        )}
                        <p className="text-[10px] text-faint mt-2">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 bg-accent-400 rounded-full mt-1" />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-surface-300 mx-auto mb-2 opacity-20" />
                <p className="text-dim text-sm">
                  {filter === "mentions" ? "No mentions yet" : filter === "unread" ? "All caught up" : "No new notifications"}
                </p>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-hairline text-center">
            <a
              href="/profile"
              className="text-xs text-dim hover:text-primary transition-colors flex items-center justify-center gap-1"
            >
              View all in Profile <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
