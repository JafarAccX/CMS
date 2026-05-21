import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";
import { User, Lock, Bell, Check, BookOpen, Briefcase, GraduationCap, Star } from "lucide-react";
import PageShell from "../components/PageShell";
import { FormField, FormTextarea } from "../components/FormField";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const sources = useAuthStore((s) => s.sources);
  const setUser = useAuthStore((s) => s.setUser);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const qc = useQueryClient();

  const lms = sources?.lms?.profile;
  const crm = sources?.crm;

  // Prefer LMS/CRM data over local DB for display
  const displayPhone = user?.phone || (crm?.mobile ? String(crm.mobile) : "") || "";
  const displayAvatar = user?.avatar_url || lms?.ProfilePicture || crm?.profilePicture || "";
  const lmsFullName = [lms?.FirstName, lms?.LastName].filter(Boolean).join(" ");

  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [phone, setPhone] = useState(displayPhone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");

  const profileMut = useMutation({
    mutationFn: (data: { username: string; bio?: string; phone?: string }) => api.patch("/profile", data),
    onSuccess: (res) => {
      if (user) setUser({ ...user, username: res.data.username, bio: res.data.bio, phone: res.data.phone });
      setMsg("Profile updated!");
      setTimeout(() => setMsg(""), 3000);
    },
  });

  const passwordMut = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.post("/profile/change-password", data),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setMsg("Password changed!");
      setTimeout(() => setMsg(""), 3000);
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => { markAllRead(); qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });

  return (
    <PageShell title="Profile" icon={<User className="w-5 h-5" />}>
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        {msg && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 text-sm flex items-center gap-2 animate-fade-in"><Check className="w-4 h-4" />{msg}</div>}

        {/* LMS Profile Card — shown when LMS data is available */}
        {lms && (
          <section className="card p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2 text-primary">
              <BookOpen className="w-5 h-5 text-dim" /> LMS Profile
            </h2>
            <div className="flex items-start gap-4 mb-5">
              {displayAvatar ? (
                <img src={displayAvatar} alt="avatar" className="w-16 h-16 rounded-full object-cover border border-hairline" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-accent-400/20 flex items-center justify-center text-accent-300 text-xl font-semibold border border-hairline">
                  {(lms.FirstName?.[0] || user?.username?.[0] || "?").toUpperCase()}
                </div>
              )}
              <div>
                {lmsFullName && <div className="text-primary font-semibold text-lg">{lmsFullName}</div>}
                {lms.Email && <div className="text-muted text-sm">{lms.Email}</div>}
                {lms.Mobile && <div className="text-dim text-sm">+{lms.Mobile}</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
              {lms.Designation && (
                <div className="flex items-start gap-2">
                  <Briefcase className="w-4 h-4 text-dim mt-0.5 shrink-0" />
                  <div>
                    <div className="text-faint text-[11px] uppercase tracking-wide">Designation</div>
                    <div className="text-muted">{lms.Designation}</div>
                  </div>
                </div>
              )}
              {lms.CurrentCompany && (
                <div className="flex items-start gap-2">
                  <Briefcase className="w-4 h-4 text-dim mt-0.5 shrink-0" />
                  <div>
                    <div className="text-faint text-[11px] uppercase tracking-wide">Company</div>
                    <div className="text-muted">{lms.CurrentCompany}</div>
                  </div>
                </div>
              )}
              {lms.YearOfExperience != null && (
                <div className="flex items-start gap-2">
                  <Star className="w-4 h-4 text-dim mt-0.5 shrink-0" />
                  <div>
                    <div className="text-faint text-[11px] uppercase tracking-wide">Experience</div>
                    <div className="text-muted">{lms.YearOfExperience} yr{lms.YearOfExperience !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              )}
              {lms.Education && (
                <div className="flex items-start gap-2">
                  <GraduationCap className="w-4 h-4 text-dim mt-0.5 shrink-0" />
                  <div>
                    <div className="text-faint text-[11px] uppercase tracking-wide">Education</div>
                    <div className="text-muted">{lms.Education}</div>
                  </div>
                </div>
              )}
            </div>

            {lms.Skills && (
              <div className="mt-4">
                <div className="text-faint text-[11px] uppercase tracking-wide mb-2">Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {lms.Skills.split(",").map((s) => s.trim()).filter(Boolean).map((skill) => (
                    <span key={skill} className="chip chip-accent text-[11px]">{skill}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Edit Profile */}
        <section className="card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-primary"><User className="w-5 h-5 text-dim" />Edit Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-muted mb-1.5">Email</label>
              <input type="email" value={user?.email || ""} disabled className="w-full bg-surface-100 border border-hairline rounded-[10px] px-4 py-3 text-faint cursor-not-allowed text-[13.5px]" />
            </div>
            <FormField label="Username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
            <FormField label="Phone Number" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            <FormTextarea label="About / Bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Hey there! I am using AcceleratorX." className="h-24" />
            <button onClick={() => profileMut.mutate({ username, bio, phone })} disabled={profileMut.isPending} className="btn-primary px-4 py-2 rounded-[10px] font-medium transition-all disabled:opacity-50">Save Changes</button>
          </div>
        </section>

        {/* Change Password */}
        <section className="card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-primary"><Lock className="w-5 h-5 text-dim" />Change Password</h2>
          <div className="space-y-4">
            <FormField label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <FormField label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <button onClick={() => passwordMut.mutate({ currentPassword, newPassword })} disabled={passwordMut.isPending} className="btn-primary px-4 py-2 rounded-[10px] font-medium transition-all disabled:opacity-50">Update Password</button>
          </div>
        </section>

        {/* Notifications */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2 text-primary"><Bell className="w-5 h-5 text-dim" />Notifications {unreadCount > 0 && <span className="chip chip-accent text-[10px]">{unreadCount}</span>}</h2>
            {unreadCount > 0 && <button onClick={() => markAllMut.mutate()} className="text-xs text-accent-300 hover:text-accent-400">Mark all read</button>}
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {notifications.slice(0, 20).map((n) => (
              <div key={n.id} className={`p-3 rounded-lg text-sm transition-all ${n.is_read ? "bg-surface-100/50 text-dim" : "bg-accent-100 border border-accent-200 text-accent-300"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="capitalize font-medium">{n.type.replace("_", " ")}</span>
                  <span className="text-[10px] text-faint">{new Date(n.created_at).toLocaleString()}</span>
                </div>
                {n.content_preview && <p className="text-xs text-dim line-clamp-1">{n.content_preview}</p>}
              </div>
            ))}
            {notifications.length === 0 && <p className="text-faint text-sm text-center py-4">No notifications</p>}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
