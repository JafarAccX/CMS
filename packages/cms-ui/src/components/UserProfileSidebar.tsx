import { X, Phone, Info, Calendar, Shield, MessageCircle, Users } from "lucide-react";
import OnlineStatusDot from "./OnlineStatusDot";

interface UserProfileSidebarProps {
  user: {
    id: string;
    username: string;
    email?: string;
    role?: string;
    bio?: string;
    phone?: string;
    avatar_url?: string;
    created_at?: string;
    memberships?: Array<{ batch: { id: string; name: string } }>;
  } | null;
  onClose: () => void;
  onMessage?: (userId: string) => void;
  isOnline?: boolean;
}

export function UserProfileSidebar({ user, onClose, onMessage, isOnline }: UserProfileSidebarProps) {
  if (!user) return null;

  const joinedDate = user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    day: 'numeric'
  }) : "Unknown";

  return (
    <aside className="w-80 bg-surface-50 border-l border-hairline flex flex-col shrink-0 h-screen overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 shadow-2xl z-50">
      {/* Header */}
      <header className="h-14 border-b border-hairline bg-surface-50/80 backdrop-blur flex items-center px-4 gap-4 sticky top-0 z-10">
        <button onClick={onClose} className="p-2 -ml-2 text-dim hover:text-primary transition-colors">
          <X className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-sm text-primary">Contact Info</h2>
      </header>

      {/* Profile Pic & Name */}
      <section className="p-8 flex flex-col items-center text-center bg-surface-100/30">
        <div className="relative mb-4 group">
          <span className={`avatar ${user.role === 'admin' ? 'avatar-coral' : user.role === 'mentor' ? 'avatar-cyan' : 'avatar-indigo'} w-32 h-32 text-4xl ring-4 ring-surface-50 group-hover:scale-105 transition-transform duration-500`}>
            {user.username[0].toUpperCase()}
          </span>
          {isOnline !== undefined && (
            <div className="absolute bottom-2 right-2 ring-4 ring-surface-50 bg-surface-50 rounded-full">
               <OnlineStatusDot isOnline={isOnline} size="lg" />
            </div>
          )}
        </div>
        <h3 className="text-xl font-bold text-primary mb-1">{user.username}</h3>
        <p className="text-sm text-dim">{user.email}</p>
      </section>

      {/* About Section */}
      <section className="p-6 space-y-6">
        <div className="space-y-1.5">
          <label className="t-overline text-accent-300 flex items-center gap-2">
            <Info className="w-3 h-3" /> About
          </label>
          <p className="text-sm text-muted leading-relaxed italic">
            {user.bio || "No bio set yet."}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="t-overline text-accent-300 flex items-center gap-2">
            <Shield className="w-3 h-3" /> Role
          </label>
          <div className="flex items-center gap-2">
             <span className={`chip ${
               user.role === 'admin' ? 'chip-admin' :
               user.role === 'mentor' ? 'chip-mentor' :
               'chip-learner'
             }`}>
               {user.role}
             </span>
          </div>
        </div>

        {user.phone && (
          <div className="space-y-1.5">
            <label className="t-overline text-accent-300 flex items-center gap-2">
              <Phone className="w-3 h-3" /> Phone Number
            </label>
            <p className="text-sm text-muted font-medium">
              {user.phone}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="t-overline text-accent-300 flex items-center gap-2">
            <Calendar className="w-3 h-3" /> Member Since
          </label>
          <p className="text-sm text-muted">
            {joinedDate}
          </p>
        </div>
      </section>

      {/* Batches Section */}
      <section className="p-6 border-t border-hairline">
         <h4 className="t-overline text-dim mb-4">Enrolled Batches</h4>
         <div className="space-y-2">
            {user.memberships && user.memberships.length > 0 ? (
               user.memberships.map((m) => (
                  <div key={m.batch.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-100 border border-hairline">
                     <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center text-accent-300">
                        <Users className="w-4 h-4" />
                     </div>
                     <span className="text-sm font-medium text-muted truncate">{m.batch.name}</span>
                  </div>
               ))
            ) : (
               <p className="text-xs text-faint italic">No batches found for this user.</p>
            )}
         </div>
      </section>

      {/* Common Actions */}
      <section className="p-6 border-t border-hairline bg-surface-100/20">
         <h4 className="t-overline text-dim mb-4">Actions</h4>
         <div className="space-y-2">
            <button
              onClick={() => { if(onMessage) onMessage(user.id); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent-100 hover:bg-accent-200 transition-all text-sm text-accent-300 group border border-accent-200"
            >
               <MessageCircle className="w-4 h-4 text-accent-300 group-hover:scale-110 transition-transform" />
               Send Direct Message
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-100 hover:bg-surface-200 transition-all text-sm text-red-400/80 hover:text-red-400 group border border-hairline">
               <Shield className="w-4 h-4 group-hover:scale-110 transition-transform" />
               Report @{user.username}
            </button>
         </div>
      </section>
    </aside>
  );
}
