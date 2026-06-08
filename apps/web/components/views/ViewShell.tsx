"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";
import type { ViewConfig } from "@/lib/views";
import { glossary } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useViewEmbedded, useViewsTheme } from "@/lib/view-embed-context";
import { ShareButton } from "@/components/share/ShareButton";
import { usePermissions } from "@/lib/use-permissions";

interface ViewShellProps {
  view: ViewConfig;
  subtitle?: string;
  headerAction?: React.ReactNode;
  isEmpty?: boolean;
  onEmptyAction?: () => void;
  children?: React.ReactNode;
}

export function ViewShell({
  view,
  subtitle,
  headerAction,
  isEmpty,
  onEmptyAction,
  children,
}: ViewShellProps) {
  const [showHelp, setShowHelp] = useState(false);
  const pathname = usePathname();
  const embedded = useViewEmbedded() || pathname.includes("/embed/");
  const isViewsMode = useViewsTheme();
  const { canCreate, canShare } = usePermissions();

  return (
    <div className={cn("w-full", embedded ? "p-4" : "p-8 max-w-6xl")}>
      {embedded ? (
        canCreate && headerAction ? (
          <div className="flex items-center justify-end gap-2 mb-4">{headerAction}</div>
        ) : null
      ) : (
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className={cn("text-xs mb-1", isViewsMode ? "text-violet-400" : "text-gray-400")}>
              View · {view.label}
            </p>
            <h1 className="text-2xl font-bold text-gray-900">{view.label}</h1>
            <p className={cn("text-sm mt-1", isViewsMode ? "text-violet-500" : "text-gray-500")}>
              {subtitle ?? view.anchorQuestion}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canCreate && headerAction}
            {canShare && (
              <ShareButton
                resourceType="view"
                resourceKey={view.segment}
                title={view.label}
              />
            )}
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className={cn(
                "flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 border transition-colors",
                isViewsMode
                  ? "text-violet-500 hover:text-violet-700 border-violet-200 bg-violet-50 hover:bg-violet-100"
                  : "text-gray-500 hover:text-gray-800 border-gray-200 bg-white"
              )}
            >
              <HelpCircle size={13} />
              How this works
            </button>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div
          className={cn(
            "rounded-xl border p-10 text-center mx-auto",
            isViewsMode
              ? "bg-violet-50 border-violet-200"
              : "bg-white border-gray-200",
            embedded ? "max-w-none mt-2 px-6 py-8" : "max-w-lg mt-12"
          )}
        >
          <div
            className="h-12 w-12 rounded-lg mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: `${view.color}18` }}
          >
            <view.icon size={22} style={{ color: view.color }} />
          </div>
          <h2 className="font-semibold text-gray-900 mb-2">{view.emptyTitle}</h2>
          <p className="text-sm text-gray-500 mb-6">{view.emptyDescription}</p>
          {view.emptyCta && onEmptyAction && canCreate && (
            <button
              type="button"
              onClick={onEmptyAction}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md"
            >
              {view.emptyCta}
            </button>
          )}
        </div>
      ) : (
        children
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">How this works</h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-600">{view.anchorQuestion}</p>
              <p className="text-xs text-gray-400">
                Views project the repository — they never own data. Each view is a role-targeted
                lens over the same graph of capabilities, realizations, systems, and products.
              </p>
              <dl className="space-y-3">
                {glossary.map(({ term, definition }) => (
                  <div key={term}>
                    <dt className="text-xs font-semibold text-gray-800">{term}</dt>
                    <dd className="text-xs text-gray-500 mt-0.5">{definition}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href="#"
                onClick={() => setShowHelp(false)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Close
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
