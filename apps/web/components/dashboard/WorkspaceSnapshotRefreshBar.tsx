"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stale: boolean;
  rebuilding: boolean;
  className?: string;
}

export function WorkspaceSnapshotRefreshBar({ stale, rebuilding, className }: Props) {
  if (!rebuilding) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-indigo-200/80 bg-indigo-50/90 px-3.5 py-2 text-sm text-indigo-800",
        className
      )}
    >
      <Loader2 size={16} className="animate-spin flex-shrink-0 text-indigo-600" />
      <span>Refreshing workspace summary…</span>
    </div>
  );
}
