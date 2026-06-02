"use client";

import type { CapabilityMap, MinEAObject, Product } from "@minea/types";
import { useQuery } from "@tanstack/react-query";
import { capabilityMapApi, objectsApi, productsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { WORKSPACE_SUMMARY_GC_MS, WORKSPACE_SUMMARY_STALE_MS } from "@/lib/workspace-summary-cache";

export type MetricDrawerId = "domains" | "capabilities" | "systems" | "products";

export function metricDrawerQueryKey(
  metric: MetricDrawerId,
  orgSlug: string,
  workspaceSlug: string
) {
  return ["metric-drawer", metric, orgSlug, workspaceSlug] as const;
}

const SYSTEM_TYPES = ["application", "solution", "technical_capability"] as const;

async function fetchSystems(
  orgSlug: string,
  workspaceSlug: string,
  token: string
): Promise<MinEAObject[]> {
  const responses = await Promise.all(
    SYSTEM_TYPES.map((type) =>
      objectsApi.list(orgSlug, workspaceSlug, { type, page: 1 }, token).then((r) => r.items)
    )
  );
  return responses.flat();
}

export function useMetricDrawerData(
  metric: MetricDrawerId | null,
  orgSlug: string,
  workspaceSlug: string
) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug) && metric !== null;

  return useQuery({
    queryKey: metric
      ? metricDrawerQueryKey(metric, orgSlug, workspaceSlug)
      : ["metric-drawer", "idle"],
    enabled,
    queryFn: async (): Promise<{
      map?: CapabilityMap;
      systems?: MinEAObject[];
      products?: Product[];
    }> => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      if (metric === "domains" || metric === "capabilities") {
        const map = await capabilityMapApi.get(orgSlug, workspaceSlug, token);
        return { map };
      }
      if (metric === "systems") {
        const systems = await fetchSystems(orgSlug, workspaceSlug, token);
        return { systems };
      }
      const { items } = await productsApi.list(orgSlug, workspaceSlug, token);
      return { products: items };
    },
    staleTime: WORKSPACE_SUMMARY_STALE_MS,
    gcTime: WORKSPACE_SUMMARY_GC_MS,
  });
}
