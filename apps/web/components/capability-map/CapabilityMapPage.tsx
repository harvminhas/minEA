"use client";

import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { capabilityMapApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { useTenancy } from "@/lib/tenancy";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { CapabilityMapView } from "@/components/capability-map/CapabilityMapView";

export function CapabilityMapPage() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const queryEnabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  const mapQuery = useQuery({
    queryKey: ["capability-map", orgSlug, workspaceSlug],
    enabled: queryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return capabilityMapApi.get(orgSlug, workspaceSlug, token);
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
  };

  if (mapQuery.isLoading || !queryEnabled) {
    return <p className="p-8 text-sm text-gray-400">Loading capability map…</p>;
  }

  if (mapQuery.isError) {
    return (
      <p className="p-8 text-sm text-red-600">{(mapQuery.error as Error).message}</p>
    );
  }

  return <CapabilityMapView map={mapQuery.data!} onRefresh={refresh} />;
}
