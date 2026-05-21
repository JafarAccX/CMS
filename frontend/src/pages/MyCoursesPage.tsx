import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import {
  ArrowLeft, BookOpen, Calendar, CheckCircle2, Clock, XCircle,
  GraduationCap, Loader2,
} from "lucide-react";

interface Enrollment {
  id: string;
  batchName: string;
  course: string | null;
  startDate: string | null;
  endDate: string | null;
  paymentStatus: string;
  completionStatus: string;
  active: boolean;
}

interface EnrollmentsResponse {
  customer: { name: string; email: string | null; phone: string; active: boolean } | null;
  enrollments: Enrollment[];
}

export default function MyCoursesPage() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, error } = useQuery<EnrollmentsResponse>({
    queryKey: ["learner-enrollments"],
    queryFn: async () => {
      const { data } = await api.get("/learner/enrollments");
      return data;
    },
  });

  const statusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case "in_progress":
      case "ongoing":
        return <Clock className="w-4 h-4 text-amber-400" />;
      default:
        return <XCircle className="w-4 h-4 text-dim" />;
    }
  };

  const paymentBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "paid" || s === "completed") return "bg-green-500/10 text-green-400 border-green-500/20";
    if (s === "pending") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-surface-200 text-dim border-hairline";
  };

  return (
    <div className="h-screen flex flex-col bg-surface bg-grid">
      <header className="h-14 px-6 flex-shrink-0 border-b border-hairline flex items-center gap-3">
        <Link to="/" className="p-1.5 text-dim hover:text-primary rounded-lg hover:bg-surface-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <GraduationCap className="w-5 h-5 text-accent-300" />
        <span className="text-sm font-semibold text-primary">My Courses & Enrollments</span>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-glow">
        <div className="px-10 py-9 max-w-[960px] mx-auto">
          <div className="mb-8">
            <h1 className="font-serif text-[40px] font-medium leading-tight text-primary" style={{ letterSpacing: "-0.02em" }}>
              Your Learning Journey
            </h1>
            <p className="text-muted text-sm mt-2">
              Courses and batches from your CRM enrollments
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-accent-300 animate-spin" />
              <span className="ml-3 text-muted text-sm">Loading your enrollments...</span>
            </div>
          )}

          {error && (
            <div className="card p-6 text-center">
              <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-muted text-sm">Failed to load enrollment data. Please try again later.</p>
            </div>
          )}

          {data && !isLoading && (
            <>
              {data.customer && (
                <div className="card p-4 mb-6 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent-100 text-accent-300 flex items-center justify-center font-semibold text-sm">
                    {data.customer.name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-primary">{data.customer.name || user?.username}</div>
                    <div className="text-[12px] text-dim">
                      {data.customer.email && <span>{data.customer.email}</span>}
                      {data.customer.email && data.customer.phone && <span className="mx-1.5">·</span>}
                      {data.customer.phone && <span>{data.customer.phone}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${data.customer.active ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                    {data.customer.active ? "Active" : "Inactive"}
                  </span>
                </div>
              )}

              {data.enrollments.length === 0 ? (
                <div className="card p-10 text-center">
                  <BookOpen className="w-10 h-10 text-dim mx-auto mb-4" />
                  <h3 className="text-primary font-semibold text-base mb-1">No enrollments found</h3>
                  <p className="text-muted text-sm">You don't have any course enrollments in the system yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.enrollments.map((enrollment) => (
                    <div key={enrollment.id} className="card card-hover p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-accent-100 text-accent-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-primary truncate">
                              {enrollment.course || enrollment.batchName}
                            </h3>
                            {enrollment.active && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                            )}
                          </div>
                          {enrollment.course && (
                            <p className="text-[12.5px] text-muted mb-2">Batch: {enrollment.batchName}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-dim">
                            {enrollment.startDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(enrollment.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                {enrollment.endDate && ` — ${new Date(enrollment.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              {statusIcon(enrollment.completionStatus)}
                              <span className="capitalize">{enrollment.completionStatus.replace(/_/g, " ")}</span>
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 capitalize ${paymentBadge(enrollment.paymentStatus)}`}>
                          {enrollment.paymentStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
