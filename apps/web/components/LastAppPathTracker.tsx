"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isTrackableAppPath } from "@/lib/last-app-path";
import { useAppStore } from "@/lib/store";

/** Persists the last workspace route the signed-in user visited. */
export function LastAppPathTracker() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const setLastAppPath = useAppStore((s) => s.setLastAppPath);

  useEffect(() => {
    if (!isSignedIn || !isTrackableAppPath(pathname)) return;
    setLastAppPath(pathname);
  }, [pathname, isSignedIn, setLastAppPath]);

  return null;
}
