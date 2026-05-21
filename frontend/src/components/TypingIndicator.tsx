interface TypingIndicatorProps {
  users: { userId: string; username: string }[];
  className?: string;
}

export default function TypingIndicator({ users, className = "" }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const label =
    users.length === 1
      ? `${users[0].username} is typing`
      : users.length === 2
      ? `${users[0].username} and ${users[1].username} are typing`
      : `${users[0].username} and ${users.length - 1} others are typing`;

  return (
    <div className={`flex items-center gap-2 px-4 py-1.5 ${className}`}>
      <div className="flex items-center gap-1">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="text-xs text-dim italic">{label}</span>
    </div>
  );
}
