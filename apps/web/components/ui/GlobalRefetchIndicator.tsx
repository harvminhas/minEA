"use client";

import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";

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
    <div className={`fixed left-0 right-0 z-[70] pointer-events-none ${topClassName}`}>
      <DiagramSavingBar active compact label="Updating" />
    </div>
  );
}
