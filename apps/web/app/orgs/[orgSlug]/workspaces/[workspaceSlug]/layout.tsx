"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWorkspaceDashboardState } from "@/lib/use-workspace-dashboard";
import { workspaceDashboardQueryKey } from "@/lib/workspace-summary-cache";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useTenancy } from "@/lib/tenancy";
import { useAppStore } from "@/lib/store";
import { workspacesApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AccessProvider } from "@/lib/access-context";
import { ReadOnlyBanner } from "@/components/ui/ReadOnlyBanner";
import { effectiveWorkspaceRole } from "@/lib/permissions";
import type { OrgRole, WorkspaceRole } from "@minea/types";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEmbed = pathname.includes("/embed/");
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { activeOrg, setActiveWorkspace } = useAppStore();
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
      queryFn: () => fetchWorkspaceDashboardState(orgSlug, workspaceSlug, getToken),
      // Do not treat prefetch as fresh for 5m — background rebuild may complete after prefetch.
      staleTime: 0,
    });
  }, [queryEnabled, orgSlug, workspaceSlug, queryClient, getToken]);

  const viewerByRole =
    effectiveWorkspaceRole(
      activeOrg?.role as OrgRole | undefined,
      workspace?.role as WorkspaceRole | undefined
    ) === "viewer";
  const accessMode = viewerByRole ? "read" : "full";

  return (
    <AccessProvider mode={accessMode}>
      {!isEmbed && viewerByRole && <ReadOnlyBanner />}
      {children}
      {!isEmbed && <ChatPanel />}
    </AccessProvider>
  );
}
