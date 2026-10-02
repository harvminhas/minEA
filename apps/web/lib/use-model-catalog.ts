"use client";

import { useQuery } from "@tanstack/react-query";
import type { MinEAObject, ObjectType } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { rowFromObject, type CatalogRow } from "@/lib/model-catalog";
import { useTenancy } from "@/lib/tenancy";

const TYPES: ObjectType[] = [
  "application",
  "solution",
  "technical_capability",
  "cloud_service",
  "model",
  "integration_flow",
  "api",
  "event",
  "tool",
  "location",
  "external_party",
];

export function useModelCatalog() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const enabled = Boolean(orgSlug && workspaceSlug);

  return useQuery({
    queryKey: ["model-catalog", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) {
        return { rows: [] as CatalogRow[], connections: [] as MinEAObject[] };
      }
      const pages = await Promise.all(
        TYPES.map((type) =>
          objectsApi.list(orgSlug, workspaceSlug, { type, page_size: 200 }, token).catch(() => ({ items: [] as MinEAObject[] }))
        )
      );
      const objects = pages.flatMap((page) => page.items ?? []);
      const rows = objects.map(rowFromObject).filter((row): row is CatalogRow => row != null);
      const connections = objects.filter((object) =>
        object.type === "integration_flow" || object.type === "api" || object.type === "event" || object.type === "tool"
      );
      const locations = objects.filter((object) => object.type === "location");
      const parties = objects.filter((object) => object.type === "external_party");
      return { rows, connections, locations, parties };
    },
  });
}
