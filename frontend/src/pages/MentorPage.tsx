import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../api/client";
import { BookOpen, Users, MessageSquare, Flag } from "lucide-react";
import PageShell from "../components/PageShell";

export default function MentorPage() {
  const { data: batches } = useQuery({
    queryKey: ["mentor-batches"],
    queryFn: async () => (await api.get("/mentor/batches")).data,
  });

  const { data: modQueue } = useQuery({
    queryKey: ["mod-queue"],
    queryFn: async () => (await api.get("/mod-queue")).data,
  });

  return (
    <PageShell title="Mentor Dashboard" icon={<BookOpen className="w-5 h-5" />}>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
          <BookOpen className="w-5 h-5 text-accent-300" />Assigned Batches
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {batches?.map((b: any) => (
            <Link key={b.id} to={`/batch/${b.id}`} className="group card card-hover p-5">
              <h3 className="text-primary font-medium group-hover:text-accent-300 transition-colors">{b.name}</h3>
              <p className="text-dim text-sm mt-1">{b.description || "No description"}</p>
              <div className="flex gap-4 mt-3 text-xs text-faint">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b._count?.memberships || 0}</span>
                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{b._count?.channels || 0}</span>
              </div>
            </Link>
          ))}
          {(!batches || batches.length === 0) && <p className="text-faint col-span-3 text-center py-12">No assigned batches</p>}
        </div>

        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
          <Flag className="w-5 h-5 text-red-400" />Flagged Messages
        </h2>
        <div className="space-y-3">
          {modQueue?.filter((q: any) => q.status === "pending").map((q: any) => (
            <div key={q.id} className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${q.priority === "high" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>{q.priority}</span>
                <span className="text-faint text-xs">in #{q.channel?.name} ({q.channel?.batch?.name})</span>
              </div>
              <p className="text-muted text-sm">"{q.message?.content?.slice(0, 100)}"</p>
              <p className="text-faint text-xs mt-1">by {q.message?.sender?.username}</p>
            </div>
          ))}
          {(!modQueue || modQueue.filter((q: any) => q.status === "pending").length === 0) && <p className="text-faint text-center py-8">No flagged messages</p>}
        </div>
      </div>
    </PageShell>
  );
}
