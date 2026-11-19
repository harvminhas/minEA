"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi, processesApi, productsApi } from "@/lib/api-client";
import { useModelCatalog } from "@/lib/use-model-catalog";
import {
  groupMappedLinks,
  mappedLinksFromPeople,
  mappedLinksFromProcesses,
  mappedLinksFromProducts,
  mappedLinksFromRelationships,
  type MappedLink,
  type MappedScope,
} from "@/lib/capability-mapping";

export function useCapabilityMappedLinks(scopes: MappedScope[], currentCapabilityId?: string) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const catalog = useModelCatalog();
  const enabled = Boolean(orgSlug && workspaceSlug && scopes.length);

  const lists = useQuery({
    queryKey: ["capability-mapping-lists", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { processes: [], products: [] };
      const [processes, products] = await Promise.all([
        processesApi.list(orgSlug, workspaceSlug, token),
        productsApi.list(orgSlug, workspaceSlug, token),
      ]);
      return { processes: processes.items, products: products.items };
    },
  });

  const peopleQueries = useQueries({
    queries: scopes.map((scope) => ({
      queryKey: ["entity-accountabilities", orgSlug, workspaceSlug, "capability", scope.id],
      enabled,
      queryFn: async () => {
        const token = await getToken();
        if (!token || !orgSlug || !workspaceSlug) return { items: [], entityId: scope.id };
        const result = await peopleApi.listEntityAccountabilities(orgSlug, workspaceSlug, "capability", scope.id, token);
        return { items: result.items, entityId: scope.id };
      },
    })),
  });

  const links = useMemo(() => {
    const records = (catalog.data?.objects ?? []).map((object) => ({
      id: object.id,
      name: object.name,
      type: object.type,
    }));
    const rels = mappedLinksFromRelationships(catalog.data?.relationships ?? [], scopes, records, currentCapabilityId);
    const processes = mappedLinksFromProcesses(lists.data?.processes ?? [], scopes, currentCapabilityId);
    const products = mappedLinksFromProducts(lists.data?.products ?? [], scopes, currentCapabilityId);
    const people = mappedLinksFromPeople(
      peopleQueries.flatMap((query, index) =>
        (query.data?.items ?? []).map((item) => ({
          ...item,
          // Use the scope id, not a field on the cached payload — EntityOwnerLine shares this
          // query key and stores the raw { items } API response.
          entity_id: scopes[index]?.id,
        }))
      ),
      scopes,
      currentCapabilityId
    );
    return [...rels, ...processes, ...products, ...people];
  }, [catalog.data, lists.data, peopleQueries, scopes, currentCapabilityId]);

  const groups = useMemo(() => groupMappedLinks(links), [links]);

  return {
    links,
    groups,
    pending: lists.isPending || peopleQueries.some((query) => query.isPending),
  };
}

export type { MappedLink };
