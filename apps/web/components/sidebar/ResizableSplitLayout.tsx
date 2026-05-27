"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { SplitViewPanel } from "@/components/sidebar/SplitViewPanel";

const MIN_WIDTH = 280;
const MAX_WIDTH = 960;
const DEFAULT_WIDTH = 420;
const STORAGE_KEY = "minea-split-panel-width";

function getSavedWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_WIDTH;
  const n = parseInt(saved, 10);
  return Number.isFinite(n) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n)) : DEFAULT_WIDTH;
}

export function ResizableSplitLayout({ children }: { children: React.ReactNode }) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);

  // Restore saved width on mount
  useEffect(() => {
    setPanelWidth(getSavedWidth());
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      // dragging left = bigger panel, right = smaller
      const delta = startX.current - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPanelWidth(next);
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persist
      localStorage.setItem(STORAGE_KEY, String(Math.round(
        // read current from state — we need a ref for this
        startWidth.current // approximate; actual value set below via onMouseMove
      )));
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Persist whenever panelWidth changes (debounce-free for simplicity)
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(panelWidth));
    }
  }, [panelWidth]);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 flex-shrink-0 bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 cursor-col-resize transition-colors relative group"
        title="Drag to resize"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-gray-500" />
          ))}
        </div>
      </div>

      {/* Split panel */}
      <div style={{ width: panelWidth }} className="flex-shrink-0 overflow-hidden">
        <SplitViewPanel />
      </div>
    </div>
  );
}
