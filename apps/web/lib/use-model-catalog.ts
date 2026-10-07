"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { catalogApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { shouldRefreshOnEnter } from "@/lib/catalog-refresh";
import { rowFromObject, type CatalogRow } from "@/lib/model-catalog";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { savesWaiting } from "@/lib/fields/save-queue";
import { compareUpdatedAt } from "@/lib/updated-at";

export { shouldRefreshOnEnter };

export type WorkspaceCatalog = {
  version: number;
  builtAt: string | null;
  dirty: boolean;
  objects: MinEAObject[];
  relationships: Relationship[];
  rows: CatalogRow[];
  connections: MinEAObject[];
  locations: MinEAObject[];
  parties: MinEAObject[];
};

type CatalogBody = {
  version?: number;
  builtAt?: string | null;
  dirty?: boolean;
  objects?: MinEAObject[];
  relationships?: Relationship[];
};

export function catalogQueryKey(orgSlug: string, workspaceSlug: string) {
  return ["model-catalog", orgSlug, workspaceSlug] as const;
}

export function shapeCatalog(body: CatalogBody): WorkspaceCatalog {
  const objects = body.objects ?? [];
  const rows = objects.map(rowFromObject).filter((row): row is CatalogRow => row != null);
  return {
    version: body.version ?? 0,
    builtAt: body.builtAt ?? null,
    dirty: Boolean(body.dirty),
    objects,
    relationships: body.relationships ?? [],
    rows,
    connections: objects.filter((object) =>
      object.type === "integration_flow" || object.type === "api" || object.type === "event" || object.type === "tool"
    ),
    locations: objects.filter((object) => object.type === "location"),
    parties: objects.filter((object) => object.type === "external_party"),
  };
}

function newerHere(local: MinEAObject, fetched: MinEAObject): boolean {
  return compareUpdatedAt(local.updated_at, fetched.updated_at) === 1;
}

/**
 * Keep records written in this tab when a catalog fetch started before those writes: records the fetch
 * doesn't have, records with a save still waiting, and records this tab holds a newer copy of.
 */
export function mergeFreshCatalog(
  current: WorkspaceCatalog | undefined,
  fetched: WorkspaceCatalog,
  waiting: (id: string) => boolean = (id) => savesWaiting(id) > 0
): WorkspaceCatalog {
  if (!current) return fetched;
  const local = new Map(current.objects.map((object) => [object.id, object]));
  let kept = false;
  const objects = fetched.objects.map((object) => {
    const mine = local.get(object.id);
    if (mine && mine !== object && (waiting(object.id) || newerHere(mine, object))) {
      kept = true;
      return mine;
    }
    return object;
  });
  const seen = new Set(fetched.objects.map((object) => object.id));
  for (const object of current.objects) {
    if (!seen.has(object.id)) objects.push(object);
  }
  const seenRel = new Set(fetched.relationships.map((rel) => rel.id));
  const relationships = [...fetched.relationships];
  for (const rel of current.relationships) {
    if (!seenRel.has(rel.id)) relationships.push(rel);
  }
  if (!kept && objects.length === fetched.objects.length && relationships.length === fetched.relationships.length) return fetched;
  return shapeCatalog({ ...fetched, objects, relationships });
}

export function applyCatalogWrite(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string,
  change: { object?: MinEAObject; removeId?: string; relationship?: Relationship; removeRelationshipId?: string }
) {
  queryClient.setQueryData<WorkspaceCatalog>(catalogQueryKey(orgSlug, workspaceSlug), (current) => {
    if (!current) {
      return shapeCatalog({
        objects: change.object ? [change.object] : [],
        relationships: change.relationship ? [change.relationship] : [],
        dirty: true,
      });
    }
    let objects = current.objects;
    if (change.removeId) objects = objects.filter((object) => object.id !== change.removeId);
    if (change.object) {
      const next = change.object;
      objects = objects.some((object) => object.id === next.id)
        ? objects.map((object) => (object.id === next.id ? next : object))
        : [...objects, next];
    }
    let relationships = current.relationships;
    if (change.removeRelationshipId) {
      relationships = relationships.filter((rel) => rel.id !== change.removeRelationshipId);
    }
    if (change.relationship) {
      const next = change.relationship;
      relationships = relationships.some((rel) => rel.id === next.id)
        ? relationships.map((rel) => (rel.id === next.id ? next : rel))
        : [...relationships, next];
    }
    return shapeCatalog({ ...current, objects, relationships, dirty: current.dirty });
  });
}

export function useModelCatalog() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  return useQuery({
    queryKey: catalogQueryKey(orgSlug, workspaceSlug),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const fetched = shapeCatalog(await catalogApi.get(orgSlug, workspaceSlug, token));
      const current = queryClient.getQueryData<WorkspaceCatalog>(catalogQueryKey(orgSlug, workspaceSlug));
      return mergeFreshCatalog(current, fetched);
    },
  });
}
