"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceSettingsApi, type WorkspaceSettings } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { ADVANCED_LOCAL_KEY, advancedEnabled, type HiddenCounts } from "@/lib/architecture-nav";

/** Per-workspace Advanced architecture toggle. Falls back to this browser until the settings column exists. */
export function useArchitectureAdvanced(orgSlug: string, workspaceSlug: string, counts: HiddenCounts) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);
  const queryClient = useQueryClient();
  const key = ["workspace-settings", orgSlug, workspaceSlug];
  const settings = useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return workspaceSettingsApi.get(orgSlug, workspaceSlug, token);
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ADVANCED_LOCAL_KEY(orgSlug, workspaceSlug));
      setLocal(raw === "1" ? true : raw === "0" ? false : null);
    } catch {
      setLocal(null);
    }
  }, [orgSlug, workspaceSlug]);
  const serverStored = settings.data?.stored ? settings.data.architectureAdvanced ?? null : null;
  const stored = serverStored ?? (settings.data?.stored ? null : local);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      const remember = () => {
        window.localStorage.setItem(ADVANCED_LOCAL_KEY(orgSlug, workspaceSlug), next ? "1" : "0");
        setLocal(next);
      };
      if (!settings.data?.stored) {
        remember();
        return null;
      }
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return workspaceSettingsApi.save(orgSlug, workspaceSlug, { architectureAdvanced: next }, token);
    },
    onMutate: (next) => {
      setError("");
      const previous = queryClient.getQueryData<WorkspaceSettings>(key);
      if (previous?.stored) queryClient.setQueryData<WorkspaceSettings>(key, { ...previous, architectureAdvanced: next });
      return { previous };
    },
    onError: (err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      setError(err instanceof Error && /403|permission|forbidden/i.test(err.message) ? "Only workspace admins can change this" : "Couldn't save");
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(key, data);
    },
  });

  return {
    advanced: advancedEnabled(stored, counts),
    explicit: typeof stored === "boolean",
    setAdvanced: (next: boolean) => save.mutate(next),
    error,
  };
}
