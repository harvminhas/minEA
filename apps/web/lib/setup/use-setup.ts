"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setupApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { firstRunEnabled } from "@/lib/flags";
import { setupGapLine, setupState, type SetupState } from "@/lib/setup/setupMin";
import { useTenancy } from "@/lib/tenancy";
import { useModelCatalog } from "@/lib/use-model-catalog";

export function useWorkspaceSetup() {
  const enabled = firstRunEnabled();
  const catalog = useModelCatalog();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const progress = useQuery({
    queryKey: ["workspace-setup", orgSlug, workspaceSlug],
    enabled: enabled && Boolean(orgSlug && workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      return setupApi.get(orgSlug, workspaceSlug, token);
    },
  });

  const state: SetupState = setupState(catalog.data?.objects ?? [], catalog.data?.relationships ?? []);
  const ready = Boolean(catalog.data) && (!enabled || progress.isFetched);

  const save = async (body: { setupDismissedAt?: string | null; setupStep?: number | null; clearDismissed?: boolean; mapReadyShownAt?: string | null }) => {
    if (!orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token) return;
    const next = await setupApi.save(orgSlug, workspaceSlug, body, token);
    queryClient.setQueryData(["workspace-setup", orgSlug, workspaceSlug], next);
  };

  return {
    enabled,
    ready,
    state,
    gap: setupGapLine(state),
    dismissed: Boolean(progress.data?.setupDismissedAt),
    mapReadyShownAt: progress.data?.mapReadyShownAt ?? null,
    save,
  };
}
