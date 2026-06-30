"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { SPLIT_PANEL_VIEWS, getView, resolveViewId, viewPath } from "@/lib/views";
import { ViewPanelContent } from "@/components/views/ViewPanelContent";

export function SplitViewPanel() {
  const { splitViewId: storedSplitViewId, setSplitViewId, setViewMode } = useAppStore();
  const splitViewId = resolveViewId(storedSplitViewId);
  const { orgSlug, workspaceSlug } = useTenancy();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (storedSplitViewId !== splitViewId) {
      setSplitViewId(splitViewId);
    }
  }, [storedSplitViewId, splitViewId, setSplitViewId]);

  const selectedView = getView(splitViewId);
  const fullscreenHref =
    orgSlug && workspaceSlug ? viewPath(orgSlug, workspaceSlug, splitViewId) : "#";

  return (
    <div className="flex flex-col h-full bg-violet-50 overflow-hidden border-l border-violet-200/60">
      {/* Compact header — view picker + fullscreen */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-200/60 bg-violet-50/95 flex-shrink-0">
        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 w-full text-left rounded-md px-2.5 py-1.5 hover:bg-violet-100/80 transition-colors"
          >
            <span
              className="h-5 w-5 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${selectedView.color}18` }}
            >
              <selectedView.icon size={10} style={{ color: selectedView.color }} />
            </span>
            <span className="text-xs font-medium text-gray-800 truncate flex-1">
              {selectedView.label}
            </span>
            <ChevronDown
              size={11}
              className={cn("text-violet-400 flex-shrink-0 transition-transform", dropdownOpen && "rotate-180")}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-full min-w-[200px] bg-white border border-violet-200/60 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
              {SPLIT_PANEL_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => {
                    setSplitViewId(view.id);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full text-left px-3 py-1.5 text-xs transition-colors",
                    view.id === splitViewId
                      ? "bg-violet-50 text-violet-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-violet-50/60"
                  )}
                >
                  <span
                    className="h-4 w-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${view.color}18` }}
                  >
                    <view.icon size={9} style={{ color: view.color }} />
                  </span>
                  {view.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Link
          href={fullscreenHref}
          title="Open in Views mode"
          onClick={() => setViewMode("views")}
          className="p-1.5 text-violet-400 hover:text-violet-700 hover:bg-violet-100/80 rounded transition-colors flex-shrink-0"
        >
          <Maximize2 size={13} />
        </Link>
      </div>

      {/* Live view — same React tree + query cache as the main app */}
      <div className="flex-1 min-h-0">
        <ViewPanelContent viewId={splitViewId} />
      </div>
    </div>
  );
}
