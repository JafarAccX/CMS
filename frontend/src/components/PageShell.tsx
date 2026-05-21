import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PageShellProps {
  title: string;
  icon?: React.ReactNode;
  backTo?: string;
  /** Extra elements rendered on the right side of the nav */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageShell({ title, icon, backTo = "/", actions, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-surface text-primary">
      <nav className="border-b border-hairline bg-surface-50/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to={backTo}
              className="p-2 -ml-2 hover:bg-surface-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-dim" />
            </Link>
            {icon && <span className="text-accent-300">{icon}</span>}
            <h1 className="text-xl font-bold text-primary">{title}</h1>
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      </nav>
      {children}
    </div>
  );
}
