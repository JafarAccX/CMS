import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { Crown, Check, Zap, Star, Shield } from "lucide-react";
import PageShell from "../components/PageShell";

export default function SubscriptionPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();

  const { data: sub } = useQuery({ queryKey: ["subscription"], queryFn: async () => (await api.get("/subscriptions/me")).data });

  const upgradeMut = useMutation({
    mutationFn: () => api.post("/subscriptions/upgrade"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      if (user) setUser({ ...user, subscription_status: "active" });
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post("/subscriptions/cancel"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      if (user) setUser({ ...user, subscription_status: "free" });
    },
  });

  const isPro = sub?.plan === "pro" && sub?.status === "active";
  const features = [
    { icon: <Zap className="w-5 h-5" />, title: "Paid Workshops", desc: "Access exclusive paid batch content" },
    { icon: <Star className="w-5 h-5" />, title: "Priority Support", desc: "Get help from mentors faster" },
    { icon: <Shield className="w-5 h-5" />, title: "Advanced Features", desc: "File uploads, threads, and more" },
  ];

  return (
    <PageShell title="Subscription" icon={<Crown className="w-5 h-5" />}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Current Plan */}
        <div className="card p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dim text-sm">Current Plan</p>
              <h2 className="text-2xl font-serif font-medium mt-1 flex items-center gap-2 text-primary">
                {isPro ? <><Crown className="w-6 h-6 text-amber-400" />Pro</> : "Free"}
              </h2>
            </div>
            <span className={`chip ${isPro ? "chip-mentor" : "chip-muted"}`}>
              {sub?.status || "active"}
            </span>
          </div>
          {sub?.expires_at && <p className="text-faint text-sm mt-2">Expires: {new Date(sub.expires_at).toLocaleDateString()}</p>}
        </div>

        {/* Features */}
        <h3 className="text-lg font-semibold mb-4 text-primary">Pro Features</h3>
        <div className="space-y-3 mb-8">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-4 card p-4">
              <div className="w-10 h-10 bg-accent-100 rounded-lg flex items-center justify-center text-accent-300 shrink-0">{f.icon}</div>
              <div><h4 className="text-primary font-medium">{f.title}</h4><p className="text-dim text-sm">{f.desc}</p></div>
              {isPro && <Check className="w-5 h-5 text-emerald-400 shrink-0 ml-auto" />}
            </div>
          ))}
        </div>

        {/* Actions */}
        {!isPro ? (
          <button onClick={() => upgradeMut.mutate()} disabled={upgradeMut.isPending} className="btn-primary w-full py-3 font-semibold rounded-xl transition-all disabled:opacity-50">
            {upgradeMut.isPending ? "Upgrading..." : "Upgrade to Pro"}
          </button>
        ) : (
          <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className="btn-surface w-full py-3 text-dim hover:text-red-400 font-medium rounded-xl transition-all disabled:opacity-50">
            {cancelMut.isPending ? "Cancelling..." : "Cancel Subscription"}
          </button>
        )}
      </div>
    </PageShell>
  );
}
