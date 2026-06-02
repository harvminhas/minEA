"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { ObjectType } from "@minea/types";
import { useQuery } from "@tanstack/react-query";
import {
  capabilityMapApi,
  objectsApi,
  peopleApi,
  processesApi,
  productsApi,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  isNavItemDisabled,
  REPOSITORY_LAYERS,
  type NavCountSource,
  type RepositoryNavItem,
} from "@/lib/repository-nav";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  WORKSPACE_SUMMARY_GC_MS,
  WORKSPACE_SUMMARY_STALE_MS,
  invalidateWorkspaceSummary,
  repositoryNavCountsQueryKey,
} from "@/lib/workspace-summary-cache";

export { repositoryNavCountsQueryKey };

export function refreshRepositoryNavCounts(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string
) {
  return queryClient.refetchQueries({
    queryKey: repositoryNavCountsQueryKey(orgSlug, workspaceSlug),
  });
}

async function countObjectType(
  orgSlug: string,
  workspaceSlug: string,
  type: ObjectType,
  token: string
): Promise<number> {
  const res = await objectsApi.list(orgSlug, workspaceSlug, { type, page: 1 }, token);
  return res.total;
}

async function countObjectsMulti(
  orgSlug: string,
  workspaceSlug: string,
  types: ObjectType[],
  token: string
): Promise<number> {
  const totals = await Promise.all(
    types.map((type) => countObjectType(orgSlug, workspaceSlug, type, token))
  );
  return totals.reduce((sum, n) => sum + n, 0);
}

async function resolveCount(
  orgSlug: string,
  workspaceSlug: string,
  source: NavCountSource,
  token: string,
  cache: {
    capabilityMap?: { domains: number; capabilities: number };
    products?: number;
    processes?: number;
    roles?: number;
    teams?: number;
    objectTypes: Map<ObjectType, number>;
    objectMulti: Map<string, number>;
  }
): Promise<number> {
  switch (source.kind) {
    case "products": {
      if (cache.products === undefined) {
        const res = await productsApi.list(orgSlug, workspaceSlug, token);
        cache.products = res.total;
      }
      return cache.products;
    }
    case "processes": {
      if (cache.processes === undefined) {
        const res = await processesApi.list(orgSlug, workspaceSlug, token);
        cache.processes = res.total;
      }
      return cache.processes;
    }
    case "capability-map": {
      if (!cache.capabilityMap) {
        const status = await capabilityMapApi.getStatus(orgSlug, workspaceSlug, token);
        cache.capabilityMap = {
          domains: status.domain_count,
          capabilities: status.capability_count,
        };
      }
      return cache.capabilityMap.domains + cache.capabilityMap.capabilities;
    }
    case "people-roles": {
      if (cache.roles === undefined) {
        const res = await peopleApi.listRoles(orgSlug, workspaceSlug, token);
        cache.roles = res.total;
      }
      return cache.roles;
    }
    case "people-teams": {
      if (cache.teams === undefined) {
        const res = await peopleApi.listTeams(orgSlug, workspaceSlug, token);
        cache.teams = res.total;
      }
      return cache.teams;
    }
    case "objects": {
      if (!cache.objectTypes.has(source.type)) {
        cache.objectTypes.set(
          source.type,
          await countObjectType(orgSlug, workspaceSlug, source.type, token)
        );
      }
      return cache.objectTypes.get(source.type)!;
    }
    case "objects-multi": {
      const key = source.types.join(",");
      if (!cache.objectMulti.has(key)) {
        cache.objectMulti.set(
          key,
          await countObjectsMulti(orgSlug, workspaceSlug, source.types, token)
        );
      }
      return cache.objectMulti.get(key)!;
    }
    default:
      return 0;
  }
}

async function fetchNavCounts(
  orgSlug: string,
  workspaceSlug: string,
  token: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const cache = {
    objectTypes: new Map<ObjectType, number>(),
    objectMulti: new Map<string, number>(),
  };

  const items: RepositoryNavItem[] = [];
  for (const layer of REPOSITORY_LAYERS) {
    for (const item of layer.items) {
      if (isNavItemDisabled(item) || !item.countSource) {
        counts[item.segment] = 0;
        continue;
      }
      items.push(item);
    }
  }

  await Promise.all(
    items.map(async (item) => {
      counts[item.segment] = await resolveCount(
        orgSlug,
        workspaceSlug,
        item.countSource!,
        token,
        cache
      );
    })
  );

  return counts;
}

export function useRepositoryNavCounts(orgSlug: string, workspaceSlug: string) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  return useQuery({
    queryKey: repositoryNavCountsQueryKey(orgSlug, workspaceSlug),
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return fetchNavCounts(orgSlug, workspaceSlug, token);
    },
    staleTime: WORKSPACE_SUMMARY_STALE_MS,
    gcTime: WORKSPACE_SUMMARY_GC_MS,
    refetchOnWindowFocus: false,
  });
}
