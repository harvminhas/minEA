"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

export function useApplicationOptions() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const query = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application", page_size: 200 }, token!);
    },
    enabled,
  });

  const options = useMemo(() => {
    return (query.data?.items ?? [])
      .map((application) => ({
        value: application.id,
        label: application.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [query.data]);

  return {
    options,
    isLoading: query.isLoading,
  };
}
