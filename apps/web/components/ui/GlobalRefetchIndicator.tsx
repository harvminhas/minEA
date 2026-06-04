"use client";

import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const SHOW_DELAY_MS = 250;

interface Props {
  /** Distance from viewport top (e.g. 48px below TopNav). */
  topClassName?: string;
}

/** Shown while mutations run or cached queries refetch (not initial page load). */
export function GlobalRefetchIndicator({ topClassName = "top-12" }: Props) {
  const mutating = useIsMutating() > 0;
  const backgroundFetching =
    useIsFetching({
      predicate: (query) =>
        query.state.fetchStatus === "fetching" && query.state.data !== undefined,
    }) > 0;

  const active = mutating || backgroundFetching;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Updating data"
      className={`fixed left-0 right-0 z-[70] pointer-events-none flex flex-col items-center ${topClassName}`}
    >
      <div className="w-full h-0.5 bg-indigo-100 overflow-hidden">
        <div className="h-full w-1/3 bg-indigo-500 animate-pulse" />
      </div>
      <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-xs font-medium text-gray-600 shadow-sm backdrop-blur-sm">
        <Loader2 size={12} className="animate-spin text-indigo-600" aria-hidden />
        Updating…
      </span>
    </div>
  );
}
