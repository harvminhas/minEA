/**
 * BuboMap visual mark — a stylised eagle-owl (Bubo genus) face.
 *
 * Pronunciation note: BOO-bo MAP
 *
 * Anatomy of the mark (28 × 28 viewBox):
 *   Amber rounded-square → two white eyes with dark pupils → ear tufts → beak
 */

interface MarkProps {
  size?: number;
  className?: string;
  /** Gentle periodic blink (loading screen). Off under prefers-reduced-motion. */
  blink?: boolean;
}

export function BuboMapMark({ size = 28, className, blink = false }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-label="BuboMap"
      className={className}
    >
      {/* amber rounded-square */}
      <rect width="28" height="28" rx="6" fill="#b45309" />

      {/* ear tufts — the eagle-owl signature */}
      <path d="M8 9L10.5 5L13 9Z" fill="#fbbf24" />
      <path d="M15 9L17.5 5L20 9Z" fill="#fbbf24" />

      <g className={blink ? "bm-owl-blink" : undefined}>
      {/* eyes — sclera */}
      <circle cx="10" cy="16" r="4.5" fill="white" />
      <circle cx="18" cy="16" r="4.5" fill="white" />

      {/* pupils */}
      <circle cx="10" cy="16" r="2.5" fill="#1c1917" />
      <circle cx="18" cy="16" r="2.5" fill="#1c1917" />

      {/* eye-shine reflection (readable only above ~20 px) */}
      <circle cx="11" cy="14.8" r="0.75" fill="white" opacity="0.7" />
      <circle cx="19" cy="14.8" r="0.75" fill="white" opacity="0.7" />
      </g>

      {/* beak */}
      <path d="M12.5 20L14 22.5L15.5 20Z" fill="#fbbf24" />
    </svg>
  );
}

interface WordmarkProps {
  /** Controls text size and mark size together. */
  size?: "sm" | "md" | "lg";
  /** Text colour context — "dark" renders white text (for dark backgrounds). */
  theme?: "dark" | "light";
}

export function BuboMapWordmark({
  size = "md",
  theme = "dark",
}: WordmarkProps) {
  const markSize = size === "sm" ? 24 : size === "md" ? 28 : 40;

  const textClass =
    size === "lg"
      ? "text-xl font-bold tracking-tight"
      : size === "sm"
        ? "text-sm font-semibold"
        : "text-sm font-semibold";

  const textColor = theme === "dark" ? "text-white" : "text-gray-900";

  return (
    <span className="inline-flex items-center gap-2 select-none">
      <BuboMapMark size={markSize} />
      <span className={`${textClass} ${textColor}`}>BuboMap</span>
    </span>
  );
}
