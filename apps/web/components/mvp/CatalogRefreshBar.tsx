"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { catalogQueryKey, shapeCatalog } from "@/lib/use-model-catalog";

type Phase = "idle" | "refreshing" | "complete";

export function CatalogRefreshBar() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!orgSlug || !workspaceSlug || phase === "refreshing") return;
    setPhase("refreshing");
    setError("");
    const started = Date.now();
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const next = shapeCatalog(await catalogApi.refresh(orgSlug, workspaceSlug, token));
      queryClient.setQueryData(catalogQueryKey(orgSlug, workspaceSlug), next);
      const elapsed = Date.now() - started;
      if (elapsed < 700) await new Promise((resolve) => setTimeout(resolve, 700 - elapsed));
      setPhase("complete");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Could not refresh the model");
    }
  };

  useEffect(() => {
    if (phase !== "complete") return;
    const timer = window.setTimeout(() => setPhase("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const show = phase !== "idle" || Boolean(error);
  if (!show) return null;

  const message =
    phase === "refreshing"
      ? "Refreshing the model…"
      : phase === "complete"
        ? "Refresh complete."
        : error || "Saved changes are not in the shared view yet.";

  const label = phase === "refreshing" ? "Refreshing…" : phase === "complete" ? "Complete" : "Refresh model";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f3d19c] bg-[#fffaf0] px-4 py-2" role="status" aria-live="polite">
      <p className="text-[13px] text-[#9a3412]">{message}</p>
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={phase !== "idle"}
        className="shrink-0 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}
