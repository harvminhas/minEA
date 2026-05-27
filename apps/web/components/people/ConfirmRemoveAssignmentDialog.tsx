"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LINK_KIND_STYLE } from "@/lib/people-utils";

interface Props {
  entityName: string;
  linkKind: string;
  subjectType: "role" | "team";
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmRemoveAssignmentDialog({
  entityName,
  linkKind,
  subjectType,
  loading,
  error,
  onConfirm,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={loading ? undefined : onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] w-full max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Remove assignment?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                This unlinks the {subjectType} from the entity. The entity itself is not deleted.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mx-5 mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center gap-2">
          <span className="text-sm text-gray-800 font-medium truncate flex-1">{entityName}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize flex-shrink-0",
              LINK_KIND_STYLE[linkKind] ?? "bg-gray-100 text-gray-600"
            )}
          >
            {linkKind}
          </span>
        </div>

        {error && (
          <p className="mx-5 mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="px-5 py-4 flex justify-end gap-2 border-t border-gray-100 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-40 transition-colors"
          >
            {loading ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
