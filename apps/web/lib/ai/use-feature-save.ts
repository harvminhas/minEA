"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, type WorkspaceCatalog } from "@/lib/use-model-catalog";
import { savesWaiting, trackSave } from "@/lib/fields/save-queue";
import type { FeaturePatch } from "./features";

/**
 * Saves an ai_features / cost_lines patch for one record. Every patch is built from the freshest cached
 * record so two quick clicks don't undo each other; the cache is updated first and rolled back on error.
 */
export function useFeatureSave(objectId: string, fallback: MinEAObject | undefined) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [error, setError] = useState("");

  const fresh = (): MinEAObject | undefined => {
    const cached = orgSlug && workspaceSlug ? queryClient.getQueryData<WorkspaceCatalog>(catalogQueryKey(orgSlug, workspaceSlug)) : undefined;
    return cached?.objects.find((item) => item.id === objectId) ?? fallback;
  };

  const save = async (build: (current: MinEAObject) => FeaturePatch) => {
    setError("");
    const current = fresh();
    if (!current) return;
    let patch: FeaturePatch;
    try {
      patch = build(current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      return;
    }
    if (orgSlug && workspaceSlug) {
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, {
        object: { ...current, properties: { ...(current.properties ?? {}), ...patch.properties } },
      });
    }
    try {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const saved = await trackSave(objectId, () =>
        objectsApi.update(orgSlug, workspaceSlug, objectId, { properties: patch.properties }, token)
      );
      if (savesWaiting(objectId) === 0) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, objectId] });
    } catch (err) {
      if (orgSlug && workspaceSlug) {
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: current });
        queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
      }
      setError(`Couldn't save: ${err instanceof Error ? err.message : "Could not save"}`);
    }
  };

  return { save, error, setError };
}
