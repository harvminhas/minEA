"use client";

import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  label?: string;
  className?: string;
}

/** Full-width saving indicator for architecture diagram modals and previews. */
export function DiagramSavingBar({
  active,
  label = "Saving changes…",
  className,
}: Props) {
  if (!active) return null;

  return (
    <div
      className={cn("w-full flex-shrink-0", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center justify-center bg-teal-600 px-4 py-2.5">
        <p className="text-xs font-bold tracking-wider text-white uppercase">{label}</p>
      </div>
      <div className="h-1.5 w-full overflow-hidden bg-teal-200">
        <div className="diagram-saving-bar-indeterminate h-full w-2/5 rounded-full bg-teal-500" />
      </div>
    </div>
  );
}
