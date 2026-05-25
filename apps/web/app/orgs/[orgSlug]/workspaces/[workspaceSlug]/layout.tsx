"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { useTenancy } from "@/lib/tenancy";
import { useAppStore } from "@/lib/store";
import { workspacesApi } from "@/lib/api-client";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { setActiveWorkspace } = useAppStore();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.get(orgSlug, workspaceSlug, token!);
    },
  });

  useEffect(() => {
    if (workspace) setActiveWorkspace(workspace);
  }, [workspace, setActiveWorkspace]);

  return (
    <>
      {children}
      <ChatPanel />
    </>
  );
}
