"use client";

import { createContext, useContext } from "react";
import { useAppStore } from "@/lib/store";

const ViewEmbedContext = createContext(false);

export function ViewEmbedProvider({
  embedded,
  children,
}: {
  embedded: boolean;
  children: React.ReactNode;
}) {
  return <ViewEmbedContext.Provider value={embedded}>{children}</ViewEmbedContext.Provider>;
}

export function useViewEmbedded() {
  return useContext(ViewEmbedContext);
}

/** True in full Views mode, or when a view is rendered inside the split panel. */
export function useViewsTheme() {
  const embedded = useViewEmbedded();
  const { viewMode } = useAppStore();
  return viewMode === "views" || (viewMode === "split" && embedded);
}
