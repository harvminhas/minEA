"use client";

import { createContext, useContext } from "react";

export type AccessMode = "full" | "read" | "share";

export interface AccessState {
  mode: AccessMode;
  isReadOnly: boolean;
}

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({
  mode,
  children,
}: {
  mode: AccessMode;
  children: React.ReactNode;
}) {
  const isReadOnly = mode !== "full";
  return (
    <AccessContext.Provider value={{ mode, isReadOnly }}>{children}</AccessContext.Provider>
  );
}

export function useAccess(): AccessState {
  const ctx = useContext(AccessContext);
  return ctx ?? { mode: "full", isReadOnly: false };
}
