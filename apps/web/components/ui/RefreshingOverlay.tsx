"use client";

import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  children: React.ReactNode;
  label?: string;
  className?: string;
}

/** Local overlay for a page/section while its query refetches. */
export function RefreshingOverlay({
  active,
  children,
  label = "Updating…",
  className,
}: Props) {
  return (
    <div className={cn("relative flex flex-col flex-1 min-h-0", className)}>
      {active && (
        <div className="absolute inset-x-0 top-0 z-30 shadow-md">
          <DiagramSavingBar active label={label} />
        </div>
      )}
      {children}
      {active && (
        <div
          className="absolute inset-0 z-20 bg-white/50 backdrop-blur-[1px] pointer-events-none"
          aria-hidden
        />
      )}
    </div>
  );
}
