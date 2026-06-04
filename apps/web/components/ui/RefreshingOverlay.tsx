"use client";

import { Loader2 } from "lucide-react";
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
      {children}
      {active && (
        <>
          <div
            className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[1px]"
            aria-hidden
          />
          <div
            role="status"
            aria-live="polite"
            className="absolute top-3 right-3 z-30 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm"
          >
            <Loader2 size={14} className="animate-spin text-indigo-600" aria-hidden />
            {label}
          </div>
        </>
      )}
    </div>
  );
}
