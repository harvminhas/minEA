"use client";

import { useCallback, useEffect, useState } from "react";

/** Detail panel sections the user folded away. Remembered per section, for every record. */
export const COLLAPSED_SECTIONS_KEY = "bubomap.detail.collapsedSections";

export function readCollapsed(storage: Pick<Storage, "getItem"> | null | undefined): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(COLLAPSED_SECTIONS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function toggleCollapsed(current: ReadonlySet<string>, section: string, collapse: boolean): Set<string> {
  const next = new Set(current);
  if (collapse) next.add(section);
  else next.delete(section);
  return next;
}

export function writeCollapsed(storage: Pick<Storage, "setItem"> | null | undefined, sections: ReadonlySet<string>) {
  try {
    storage?.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...sections].sort()));
  } catch {
    // Private mode or full storage: the fold still works for this visit.
  }
}

const browserStorage = () => (typeof window === "undefined" ? null : window.localStorage);
const EVENT = "bubomap:collapsed-sections";

/** Everything starts expanded; a folded section stays folded across records and visits. */
export function useCollapsedSections(): [Set<string>, (section: string, collapse: boolean) => void] {
  const [collapsed, setState] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const sync = () => setState(readCollapsed(browserStorage()));
    // Read after mount so server and first client render agree.
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((section: string, collapse: boolean) => {
    const next = toggleCollapsed(readCollapsed(browserStorage()), section, collapse);
    writeCollapsed(browserStorage(), next);
    setState(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [collapsed, set];
}
