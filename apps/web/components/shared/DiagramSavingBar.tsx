"use client";

import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  label?: string;
  className?: string;
  /** Minimal 2px bar — no label banner (global refetch indicator). */
  compact?: boolean;
}

/** Full-width saving indicator for architecture diagram modals and previews. */
export function DiagramSavingBar({
  active,
  label = "Saving changes…",
  className,
  compact = false,
}: Props) {
  if (!active) return null;

  if (compact) {
    return (
      <div
        className={cn("w-full flex-shrink-0 h-1 overflow-hidden bg-amber-200/60", className)}
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="diagram-saving-bar-indeterminate h-full w-2/5 bg-amber-700" />
      </div>
    );
  }

  return (
    <div
      className={cn("w-full flex-shrink-0", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center justify-center bg-teal-600 px-4 py-3">
        <p className="text-sm font-bold tracking-wide text-white uppercase">{label}</p>
      </div>
      <div className="h-2 w-full overflow-hidden bg-teal-200">
        <div className="diagram-saving-bar-indeterminate h-full w-2/5 rounded-full bg-teal-500" />
      </div>
    </div>
  );
}
