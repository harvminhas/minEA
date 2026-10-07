"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, type WorkspaceCatalog } from "@/lib/use-model-catalog";
import { savesWaiting, trackSave } from "@/lib/fields/save-queue";
import { enqueueFeatureSave, type FeatureBuild } from "./feature-queue";

/**
 * Saves an ai_features / cost_lines patch for one record through its lane (lib/ai/feature-queue.ts):
 * one request at a time, in click order, each built from the server's last answer. trackSave starts at
 * the click, so leaving the page warns while anything is still queued.
 */
export function useFeatureSave(objectId: string, fallback: MinEAObject | undefined) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [error, setError] = useState("");

  const save = (build: FeatureBuild): Promise<void> => {
    setError("");
    if (!orgSlug || !workspaceSlug) {
      setError("Not signed in");
      return Promise.resolve();
    }
    const read = () =>
      queryClient.getQueryData<WorkspaceCatalog>(catalogQueryKey(orgSlug, workspaceSlug))?.objects.find((item) => item.id === objectId) ?? fallback;
    return trackSave(objectId, () =>
      enqueueFeatureSave(`${orgSlug}/${workspaceSlug}/${objectId}`, build, {
        read,
        write: (object) => applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object }),
        send: async (patch) => {
          const token = await getToken();
          if (!token) throw new Error("Not signed in");
          const saved = await objectsApi.update(orgSlug, workspaceSlug, objectId, { properties: patch.properties }, token);
          queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
          queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, objectId] });
          return saved;
        },
        onError: setError,
        alone: () => savesWaiting(objectId) <= 1,
      })
    );
  };

  return { save, error, setError };
}
