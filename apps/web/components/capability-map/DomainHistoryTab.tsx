"use client";

import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { capabilityMapApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { useTenancy } from "@/lib/tenancy";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";

interface Props {
  domainId: string;
}

export function DomainHistoryTab({ domainId }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryEnabled = useAuthQueryEnabled(orgSlug, workspaceSlug, domainId);

  const { data, isLoading } = useQuery({
    queryKey: ["domain-history", orgSlug, workspaceSlug, domainId],
    enabled: queryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return capabilityMapApi.getDomainHistory(orgSlug, workspaceSlug, domainId, token);
    },
  });

  return (
    <EntityHistoryPanel
      entries={data?.entries ?? []}
      isLoading={isLoading}
      emptyMessage="No history yet. Changes to capabilities, mappings, and this domain will appear here."
    />
  );
}
