"use client";

import { useQuery } from "@tanstack/react-query";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

export function useObjectTechDebtSummary(objectId: string, enabled = true) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const authEnabled = useAuthQueryEnabled();

  return useQuery({
    queryKey: ["object-tech-debt", orgSlug, workspaceSlug, objectId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.techDebtSummary(orgSlug, workspaceSlug, objectId, token!);
    },
    enabled: authEnabled && enabled && !!objectId,
  });
}
