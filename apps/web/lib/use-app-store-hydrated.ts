"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";

/** Wait for persisted UI preferences (including last route) before post-login redirect. */
export function useAppStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persist = useAppStore.persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
