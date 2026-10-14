"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cloudRegionsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { catalogLists } from "@/lib/setup/add-plan";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { tenantOptions, type CloudProvider, type CustomRegion, type TenantOption } from "@/lib/hosting/cloud";

const NONE: CustomRegion[] = [];

/** The workspace's custom regions (built-in regions ship with the app). */
export function useCustomRegions(): CustomRegion[] {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);
  const query = useQuery({
    queryKey: ["cloud-regions", orgSlug, workspaceSlug],
    enabled,
    staleTime: 60_000,
    queryFn: async () => cloudRegionsApi.list(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  return query.data?.custom ?? NONE;
}

/** Everything the provider → tenant → region picker needs, plus "+ custom region". */
export function useCloudPicker(): {
  tenants: TenantOption[];
  custom: CustomRegion[];
  addRegion: (provider: CloudProvider, name: string) => Promise<string>;
} {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const { objects, relationships } = catalogLists(catalog.data);
  const custom = useCustomRegions();
  const tenants = useMemo(() => tenantOptions(objects, relationships, custom), [objects, relationships, custom]);
  const addRegion = useCallback(
    async (provider: CloudProvider, name: string) => {
      const made = await cloudRegionsApi.add(orgSlug!, workspaceSlug!, provider, name, (await getToken())!);
      await queryClient.invalidateQueries({ queryKey: ["cloud-regions", orgSlug, workspaceSlug] });
      return made.key;
    },
    [orgSlug, workspaceSlug, getToken, queryClient],
  );
  return { tenants, custom, addRegion };
}
