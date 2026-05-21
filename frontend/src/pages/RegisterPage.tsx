import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Zap, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [provider, setProvider] = useState<"website" | "crm">("website");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, email, phone, password, provider);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-70 pointer-events-none" />
      <div className="absolute inset-0">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(79,124,255,0.18), transparent 60%)", filter: "blur(20px)" }} />
        <div className="absolute bottom-1/4 left-1/3 w-80 h-80 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(79,124,255,0.10), transparent 60%)", filter: "blur(20px)" }} />
      </div>

      <div className="relative w-full max-w-md px-4 z-10">
        <div className="bg-surface-50 border border-hairline rounded-2xl p-8 shadow-card">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-[12px] bg-gradient-to-br from-accent-300 via-accent-400 to-accent-600 mx-auto mb-4 flex items-center justify-center shadow-btn">
              <Zap className="w-6 h-6 text-white" strokeWidth={2.4} />
            </div>
            <h1 className="text-2xl font-bold text-primary">Create account</h1>
            <p className="text-sm text-dim mt-1">Join AcceleratorX Learning</p>
          </div>

          {/* Provider Toggle */}
          <div className="flex bg-surface-100 rounded-[10px] p-1 mb-6 border border-hairline">
            <button onClick={() => setProvider("website")} className={`flex-1 py-2 rounded-[7px] text-sm font-medium transition-all ${provider === "website" ? "bg-surface-200 text-primary border border-hairline-strong" : "text-dim hover:text-muted border border-transparent"}`}>Website</button>
            <button onClick={() => setProvider("crm")} className={`flex-1 py-2 rounded-[7px] text-sm font-medium transition-all ${provider === "crm" ? "bg-surface-200 text-primary border border-hairline-strong" : "text-dim hover:text-muted border border-transparent"}`}>CRM</button>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-[10px] p-3 mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <div className="text-[11px] font-medium text-muted mb-1.5">Username</div>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full h-[42px] px-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all" placeholder="johndoe" />
            </label>
            <label className="block">
              <div className="text-[11px] font-medium text-muted mb-1.5">Email</div>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full h-[42px] px-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all" placeholder="you@example.com" />
            </label>
            <label className="block">
              <div className="text-[11px] font-medium text-muted mb-1.5">Phone Number</div>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className="w-full h-[42px] px-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all" placeholder="+91 98765 43210" />
            </label>
            <label className="block">
              <div className="text-[11px] font-medium text-muted mb-1.5">Password</div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full h-[42px] px-3.5 bg-surface-100 border border-hairline-strong rounded-[10px] text-[13.5px] text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all" placeholder="Min 8 characters" />
            </label>
            <button type="submit" disabled={loading} className="btn-primary flex items-center justify-center gap-2 w-full h-[44px] rounded-[10px] text-sm mt-1.5 disabled:opacity-50">
              {loading ? "Creating account..." : <>Create Account <ArrowRight className="w-3.5 h-3.5" /></>}
            </button>
          </form>

          <p className="text-center text-sm text-dim mt-6">
            Already have an account? <Link to="/login" className="text-accent-300 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
