"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
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

  return (
    <>
      {children}
      {!isEmbed && <ChatPanel />}
    </>
  );
}
