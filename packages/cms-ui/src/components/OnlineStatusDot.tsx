interface OnlineStatusDotProps {
  isOnline: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function OnlineStatusDot({ isOnline, size = "sm", className = "" }: OnlineStatusDotProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  return (
    <span
      className={`
        ${sizeClasses[size]} rounded-full ring-2 ring-surface-50 inline-block shrink-0
        ${isOnline ? "bg-emerald-400 animate-pulse-soft" : "bg-surface-400"}
        ${className}
      `}
      title={isOnline ? "Online" : "Offline"}
    />
  );
}
