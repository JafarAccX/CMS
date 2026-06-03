import { Moon, Sun } from "lucide-react";
import { useUiStore } from "../store/uiStore";

/**
 * Light/dark theme toggle — a Sun/Moon morph that fits the CMS's electric
 * blue→cyan aesthetic. Sized to sit beside the existing 32px topbar icon
 * buttons. Honors prefers-reduced-motion (Tailwind `motion-reduce`).
 */
export default function ThemeToggle({ size = 32 }: { size?: number }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const isLight = theme === "light";
  const iconSize = Math.round(size * 0.5);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className="group relative inline-flex shrink-0 items-center justify-center rounded-md text-dim transition-all duration-200 hover:text-primary hover:bg-[var(--ax-hover)] hover:shadow-[0_0_0_1px_rgba(59,130,255,0.45),0_0_12px_rgba(0,219,232,0.25)] focus-visible:outline-none"
      style={{
        width: size,
        height: size,
        background: isLight ? "rgba(255,255,255,0.72)" : "transparent",
        border: isLight ? "1px solid rgba(30,41,59,0.10)" : "1px solid transparent",
        boxShadow: isLight ? "0 8px 18px -14px rgba(15,23,42,0.45)" : "none",
      }}
    >
      <span className="relative block" style={{ width: iconSize, height: iconSize }}>
        <Sun
          size={iconSize}
          className="absolute inset-0 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            opacity: isLight ? 1 : 0,
            transform: isLight ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.4)",
            color: "#f5a623",
          }}
        />
        <Moon
          size={iconSize}
          className="absolute inset-0 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            opacity: isLight ? 0 : 1,
            transform: isLight ? "rotate(90deg) scale(0.4)" : "rotate(0deg) scale(1)",
          }}
        />
      </span>
    </button>
  );
}
