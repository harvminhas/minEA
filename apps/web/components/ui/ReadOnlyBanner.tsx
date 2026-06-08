"use client";

import { Eye } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";

export function ReadOnlyBanner() {
  const { mode } = usePermissions();

  const label = mode === "share" ? "Shared view" : "Viewer access";
  const detail =
    mode === "share"
      ? "This link is read-only — you can browse but cannot create or edit."
      : "You can browse the repository and views but cannot create or edit objects.";

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <Eye size={14} className="flex-shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{label}</span> — {detail}
      </span>
    </div>
  );
}
