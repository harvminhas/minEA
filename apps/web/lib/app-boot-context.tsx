"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface AppBootContextValue {
  homeStep: number;
  setHomeStep: (step: number) => void;
}

const AppBootContext = createContext<AppBootContextValue | null>(null);

export function AppBootProvider({ children }: { children: React.ReactNode }) {
  const [homeStep, setHomeStep] = useState(0);
  const value = useMemo(() => ({ homeStep, setHomeStep }), [homeStep]);
  return <AppBootContext.Provider value={value}>{children}</AppBootContext.Provider>;
}

export function useAppBoot() {
  const ctx = useContext(AppBootContext);
  if (!ctx) throw new Error("useAppBoot must be used within AppBootProvider");
  return ctx;
}
