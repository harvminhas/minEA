"use client";

import { createContext, useContext } from "react";

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
