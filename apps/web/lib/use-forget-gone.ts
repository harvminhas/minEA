"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { claimGoneRedirect, refreshOrgList, homeAfterGone, isGoneError, lastPathAfterForgetting } from "@/lib/org-unavailable";

/**
 * When the org (or workspace) on screen comes back 403/404: forget it and go to /home once.
 * Returns true while that redirect is under way (so callers can render nothing instead of an error).
 */
export function useForgetGone(opts: { failed: boolean; error: unknown; orgSlug?: string | null; workspaceSlug?: string | null }): boolean {
  const { failed, error, orgSlug, workspaceSlug } = opts;
  const router = useRouter();
  const queryClient = useQueryClient();
  const done = useRef<string | null>(null);
  const gone = failed && !!orgSlug && isGoneError(error);
  const key = `${orgSlug ?? ""}/${workspaceSlug ?? ""}`;
  // Set when the one-shot guard says "we already bounced to /home for this": show the error instead.
  const [stayed, setStayed] = useState<string | null>(null);

  useEffect(() => {
    if (!gone || !orgSlug || done.current === key) return;
    done.current = key;
    const store = useAppStore.getState();
    store.setLastAppPath(lastPathAfterForgetting(store.lastAppPath, orgSlug, workspaceSlug));
    if (store.activeWorkspace && (!workspaceSlug || store.activeWorkspace.slug === workspaceSlug)) store.setActiveWorkspace(null);
    if (!workspaceSlug && store.activeOrg?.slug === orgSlug) store.setActiveOrg(null);
    refreshOrgList(queryClient);
    const storage = typeof window === "undefined" ? null : window.sessionStorage;
    if (claimGoneRedirect(key, Date.now(), storage)) router.replace(homeAfterGone(orgSlug));
    else setStayed(key);
  }, [gone, orgSlug, workspaceSlug, key, queryClient, router]);

  return gone && stayed !== key;
}
