"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

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

  const options = useMemo(() => {
    const items = (query.data?.items ?? []).map((domain) => ({
      value: domain.id,
      label: domain.name,
    }));
    return items.sort((a, b) => {
      if (a.label === DEFAULT_DATA_DOMAIN_NAME) return -1;
      if (b.label === DEFAULT_DATA_DOMAIN_NAME) return 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
  }, [query.data]);

  const defaultDomainId =
    options.find((option) => option.label === DEFAULT_DATA_DOMAIN_NAME)?.value ??
    options[0]?.value ??
    "";

  return {
    options,
    defaultDomainId,
    isLoading: query.isLoading,
  };
}
