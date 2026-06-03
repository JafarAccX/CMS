import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Max width class — defaults to "max-w-md" */
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({ open, onClose, children, size = "md" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="figma-modal-backdrop z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`figma-modal-shell w-full ${sizeMap[size]} animate-in zoom-in-95 duration-200`}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  icon?: React.ReactNode;
}

export function ModalHeader({ title, onClose, icon }: ModalHeaderProps) {
  return (
    <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: "var(--ax-modal-header-bg)", borderColor: "var(--ax-border)" }}>
      <h3 className="text-lg font-bold text-primary flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <button
        onClick={onClose}
        className="p-2 -mr-2 text-dim hover:text-primary rounded-lg transition-colors"
        style={{ background: "transparent" }}
        aria-label="Close dialog"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export function ModalBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-6 space-y-4 ${className}`}>{children}</div>;
}

export function ModalFooter({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-6 py-4 border-t flex gap-3 ${className}`} style={{ background: "var(--ax-modal-footer-bg)", borderColor: "var(--ax-border)" }}>
      {children}
    </div>
  );
}
