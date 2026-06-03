import type { CapabilityMap, CapabilityMapCapability } from "@minea/types";
import type { QueryClient } from "@tanstack/react-query";
import { capabilityMapApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { upsertDomainMapping } from "@/lib/domain-detail";

/** Refresh relationship-driven UI after system create/update (capabilities, platform, counts). */
export function invalidateSystemCaches(
  queryClient: QueryClient,
  orgSlug: string,
  workspaceSlug: string,
  systemId: string
): Promise<void[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["relationships", "to", systemId] }),
    queryClient.invalidateQueries({ queryKey: ["relationships", "from", systemId] }),
    queryClient.invalidateQueries({ queryKey: ["relationships"] }),
    queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, systemId] }),
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "application"] }),
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "capability"] }),
    queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["capability-heatmap", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["domain-detail", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["portfolio-capability-map", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["platform-linked", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["platform-systems", orgSlug, workspaceSlug] }),
  ]);
}

const SUPPORTED_BY = "supported_by" as const;
const DEFAULT_FITNESS = "strong";

type MapCapabilityIndex = {
  byId: Map<string, { capability: CapabilityMapCapability; domainId: string }>;
  byName: Map<string, { capability: CapabilityMapCapability; domainId: string }>;
};

function buildMapCapabilityIndex(map: CapabilityMap): MapCapabilityIndex {
  const byId = new Map<string, { capability: CapabilityMapCapability; domainId: string }>();
  const byName = new Map<string, { capability: CapabilityMapCapability; domainId: string }>();

  for (const domain of map.domains) {
    for (const capability of domain.capabilities) {
      const entry = { capability, domainId: domain.id };
      byId.set(capability.id, entry);
      byName.set(capability.name.trim().toLowerCase(), entry);
    }
  }

  return { byId, byName };
}

/** Map any capability id (including repository duplicates) to the L2 id used on the capability map. */
export async function resolveToMapCapability(
  orgSlug: string,
  workspaceSlug: string,
  capabilityId: string,
  token: string,
  map?: CapabilityMap
): Promise<{ capabilityId: string; domainId: string | null; name: string }> {
  const capabilityMap = map ?? (await capabilityMapApi.get(orgSlug, workspaceSlug, token));
  const index = buildMapCapabilityIndex(capabilityMap);

  const direct = index.byId.get(capabilityId);
  if (direct) {
    return {
      capabilityId: direct.capability.id,
      domainId: direct.domainId,
      name: direct.capability.name,
    };
  }

  let name = "";
  try {
    const obj = await objectsApi.get(orgSlug, workspaceSlug, capabilityId, token);
    name = obj.name;
  } catch {
    return { capabilityId, domainId: null, name: "" };
  }

  const byName = index.byName.get(name.trim().toLowerCase());
  if (byName) {
    return {
      capabilityId: byName.capability.id,
      domainId: byName.domainId,
      name: byName.capability.name,
    };
  }

  const domainId =
    (
      await objectsApi.get(orgSlug, workspaceSlug, capabilityId, token)
    ).properties?.domain_id as string | undefined;

  return { capabilityId, domainId: domainId ?? null, name };
}

export async function loadSystemCapabilityIds(
  orgSlug: string,
  workspaceSlug: string,
  systemId: string,
  token: string
): Promise<string[]> {
  const [rels, map] = await Promise.all([
    relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: systemId }, token),
    capabilityMapApi.get(orgSlug, workspaceSlug, token),
  ]);

  const index = buildMapCapabilityIndex(map);
  const ids = new Set<string>();

  for (const rel of rels) {
    if (
      rel.type !== SUPPORTED_BY ||
      rel.from_type !== "capability" ||
      rel.to_type !== "application"
    ) {
      continue;
    }
    const resolved = await resolveToMapCapability(
      orgSlug,
      workspaceSlug,
      rel.from_object_id,
      token,
      map
    );
    if (index.byId.has(resolved.capabilityId)) {
      ids.add(resolved.capabilityId);
    }
  }

  return [...ids];
}

export async function syncSystemCapabilityRelations(
  orgSlug: string,
  workspaceSlug: string,
  systemId: string,
  capabilityIds: string[],
  token: string
): Promise<void> {
  const map = await capabilityMapApi.get(orgSlug, workspaceSlug, token);
  const index = buildMapCapabilityIndex(map);

  const resolvedSelected = await Promise.all(
    capabilityIds.map((id) => resolveToMapCapability(orgSlug, workspaceSlug, id, token, map))
  );
  const selectedCanonical = new Set(
    resolvedSelected.filter((r) => index.byId.has(r.capabilityId)).map((r) => r.capabilityId)
  );

  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: systemId },
    token
  );

  for (const rel of existing) {
    if (
      rel.type !== SUPPORTED_BY ||
      rel.from_type !== "capability" ||
      rel.to_type !== "application"
    ) {
      continue;
    }

    const resolved = await resolveToMapCapability(
      orgSlug,
      workspaceSlug,
      rel.from_object_id,
      token,
      map
    );
    const keep =
      selectedCanonical.has(resolved.capabilityId) &&
      index.byId.has(resolved.capabilityId);

    if (!keep) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  for (const capabilityId of selectedCanonical) {
    const entry = index.byId.get(capabilityId);
    if (!entry) continue;

    await upsertDomainMapping(
      orgSlug,
      workspaceSlug,
      entry.domainId,
      capabilityId,
      systemId,
      DEFAULT_FITNESS,
      token
    );
  }
}

/** Flat list of L2 capabilities from the capability map (canonical ids for the system form). */
export function flattenMapCapabilities(map: CapabilityMap) {
  return map.domains.flatMap((domain) =>
    domain.capabilities.map((capability) => ({
      capability,
      domainId: domain.id,
      domainName: domain.name,
    }))
  );
}
