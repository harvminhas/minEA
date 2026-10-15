/**
 * An org or workspace the browser remembers can disappear (erased by a platform admin, deleted,
 * or the user was removed). Then every request for it is 403/404. Instead of retrying or bouncing
 * between pages, forget it and go to /home once; /home picks an org the user really belongs to,
 * or sends them to create one.
 */
import type { QueryClient } from "@tanstack/react-query";
import { parseAppPath } from "@/lib/last-app-path";

/** HTTP status from apiFetch's "403 detail (path)" message, if any. */
export function httpStatusOf(err: unknown): number | null {
  const m = err instanceof Error ? /^(\d{3})\b/.exec(err.message) : null;
  return m ? Number(m[1]) : null;
}

/** 403 or 404: the org/workspace is gone or no longer ours. Retrying won't help. */
export function isGoneError(err: unknown): boolean {
  const s = httpStatusOf(err);
  return s === 403 || s === 404;
}

/** React Query retry policy: never retry a 4xx (it fails the same way every time). */
export function retryUnlessClientError(failureCount: number, err: unknown, max = 1): boolean {
  const s = httpStatusOf(err);
  if (s !== null && s >= 400 && s < 500) return false;
  return failureCount < max;
}

/** The remembered path, unless it points into the org (and workspace, if given) that went away. */
export function lastPathAfterForgetting(lastAppPath: string | null, orgSlug: string, workspaceSlug?: string | null): string | null {
  if (!lastAppPath) return null;
  const parsed = parseAppPath(lastAppPath);
  if (!parsed || parsed.orgSlug !== orgSlug) return lastAppPath;
  if (workspaceSlug && parsed.workspaceSlug !== workspaceSlug) return lastAppPath;
  return null;
}

export const GONE_REDIRECT_KEY = "bubomap.goneRedirect";
const GONE_WINDOW_MS = 15_000;

type MiniStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * One redirect per org per 15 s. If /home somehow sends us straight back to the same missing org,
 * the second time we stay put and show the error with its "Go to my organisations" link.
 */
export function claimGoneRedirect(key: string, now: number, storage: MiniStorage | null): boolean {
  if (!storage) return true;
  try {
    const prev = JSON.parse(storage.getItem(GONE_REDIRECT_KEY) ?? "null") as { key?: string; at?: number } | null;
    if (prev?.key === key && typeof prev.at === "number" && now - prev.at < GONE_WINDOW_MS) return false;
    storage.setItem(GONE_REDIRECT_KEY, JSON.stringify({ key, at: now }));
  } catch {
    /* storage blocked: still redirect once per render cycle */
  }
  return true;
}

/** The org list may still name the missing org: make /home fetch it fresh. */
export function refreshOrgList(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["orgs"] });
}

export function homeAfterGone(orgSlug: string): string {
  return `/home?unavailable=${encodeURIComponent(orgSlug)}`;
}
