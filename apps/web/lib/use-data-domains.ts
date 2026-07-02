"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { buildDomainSelectOptions } from "@/lib/data-domain-assignment";

/** @deprecated Use UNASSIGNED_DOMAIN_LABEL from data-domain-assignment for empty UI state. */
export const DEFAULT_DATA_DOMAIN_NAME = "Unassigned";

export function useDataDomainOptions() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const query = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "data_domain"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "data_domain" }, token!);
    },
    enabled,
  });

  const options = useMemo(
    () => buildDomainSelectOptions(query.data?.items ?? []),
    [query.data]
  );

  return {
    options,
    isLoading: query.isLoading,
  };
}
