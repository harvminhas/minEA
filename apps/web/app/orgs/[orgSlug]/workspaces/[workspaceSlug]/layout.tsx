"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWorkspaceMetrics } from "@/lib/use-workspace-dashboard";
import {
  WORKSPACE_SUMMARY_STALE_MS,
  workspaceDashboardQueryKey,
} from "@/lib/workspace-summary-cache";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useTenancy } from "@/lib/tenancy";
import { useAppStore } from "@/lib/store";
import { workspacesApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = pathname.includes("/embed/");
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { setActiveWorkspace } = useAppStore();
  const queryClient = useQueryClient();
  const queryEnabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  const { data: workspace } = useQuery({
    queryKey: ["workspace", orgSlug, workspaceSlug],
    enabled: queryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return workspacesApi.get(orgSlug, workspaceSlug, token);
    },
  });

  useEffect(() => {
    if (workspace) setActiveWorkspace(workspace);
  }, [workspace, setActiveWorkspace]);

  // Warm landing-page metrics while the user works elsewhere in the workspace
  useEffect(() => {
    if (!queryEnabled) return;
    void queryClient.prefetchQuery({
      queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
      queryFn: () => fetchWorkspaceMetrics(orgSlug, workspaceSlug, getToken),
      staleTime: WORKSPACE_SUMMARY_STALE_MS,
    });
  }, [queryEnabled, orgSlug, workspaceSlug, queryClient, getToken]);

  return (
    <>
      {children}
      {!isEmbed && <ChatPanel />}
    </>
  );
}
