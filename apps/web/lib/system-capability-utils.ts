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
    queryClient.invalidateQueries({ queryKey: ["domain-detail", orgSlug, workspaceSlug] }),
    queryClient.invalidateQueries({ queryKey: ["domain-products", orgSlug, workspaceSlug] }),
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

  const known = new Set(flattenMapTargets(map).map((target) => target.id));
  const ids = new Set<string>();

  for (const rel of rels) {
    if (!isCapabilitySupportRel(rel)) continue;
    if (known.has(rel.from_object_id)) ids.add(rel.from_object_id);
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
  const targets = new Map(flattenMapTargets(map).map((target) => [target.id, target]));
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: systemId },
    token
  );
  const plan = planSystemCapabilitySync(existing, capabilityIds, new Set(targets.keys()));

  for (const relId of plan.deleteRelIds) {
    await relationshipsApi.delete(orgSlug, workspaceSlug, relId, token);
  }

  for (const capabilityId of plan.createIds) {
    const target = targets.get(capabilityId);
    if (!target) continue;
    if (target.level === "capability") {
      await upsertDomainMapping(
        orgSlug,
        workspaceSlug,
        target.domainId,
        capabilityId,
        systemId,
        DEFAULT_FITNESS,
        token
      );
      continue;
    }
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: SUPPORTED_BY,
        from_object_id: capabilityId,
        from_type: "capability",
        to_object_id: systemId,
        to_type: "application",
        attributes: { fitness: DEFAULT_FITNESS },
      },
      token
    );
  }
}

/** Flat list of L2 capabilities from the capability map (canonical ids for products / the domain matrix). */
export function flattenMapCapabilities(map: CapabilityMap) {
  return map.domains.flatMap((domain) =>
    domain.capabilities.map((capability) => ({
      capability,
      domainId: domain.id,
      domainName: domain.name,
    }))
  );
}

export type MapTargetLevel = "capability" | "activity";

/** A capability or activity on the map that an app can be linked to directly. */
export type MapTarget = {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
  level: MapTargetLevel;
  parentId: string | null;
  parentName: string | null;
  maturity?: number;
};

/** L2 capabilities plus their activities, in map order, for the app form picker. */
export function flattenMapTargets(map: CapabilityMap): MapTarget[] {
  const rows: MapTarget[] = [];
  for (const domain of map.domains) {
    for (const capability of domain.capabilities) {
      rows.push({
        id: capability.id,
        name: capability.name,
        domainId: domain.id,
        domainName: domain.name,
        level: "capability",
        parentId: null,
        parentName: null,
        maturity: capability.maturity ?? undefined,
      });
      for (const activity of capability.children ?? []) {
        rows.push({
          id: activity.id,
          name: activity.name,
          domainId: domain.id,
          domainName: domain.name,
          level: "activity",
          parentId: capability.id,
          parentName: capability.name,
          maturity: activity.maturity ?? undefined,
        });
      }
    }
  }
  return rows;
}

export type GroupedMapTargets = {
  domainName: string;
  capabilities: { cap: MapTarget; activities: MapTarget[] }[];
};

/** Group targets by domain, keeping each activity under its parent capability. */
export function groupMapTargets(targets: MapTarget[]): GroupedMapTargets[] {
  const groups: GroupedMapTargets[] = [];
  const byDomain = new Map<string, GroupedMapTargets>();
  const capIndex = new Map<string, { cap: MapTarget; activities: MapTarget[] }>();

  for (const target of targets) {
    let group = byDomain.get(target.domainId);
    if (!group) {
      group = { domainName: target.domainName, capabilities: [] };
      byDomain.set(target.domainId, group);
      groups.push(group);
    }
    if (target.level === "capability") {
      const entry = { cap: target, activities: [] as MapTarget[] };
      capIndex.set(target.id, entry);
      group.capabilities.push(entry);
      continue;
    }
    const parent = target.parentId ? capIndex.get(target.parentId) : undefined;
    if (parent) {
      parent.activities.push(target);
    } else {
      const entry = { cap: target, activities: [] as MapTarget[] };
      group.capabilities.push(entry);
    }
  }
  return groups;
}

/** Filter a flat target list; keep a capability if it or any of its activities match. */
export function filterMapTargets(targets: MapTarget[], query: string): MapTarget[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return targets;
  const match = (row: MapTarget) =>
    row.name.toLowerCase().includes(needle) || row.domainName.toLowerCase().includes(needle);
  const keep = new Set<string>();
  for (const row of targets) {
    if (!match(row)) continue;
    keep.add(row.id);
    if (row.level === "activity" && row.parentId) keep.add(row.parentId);
    if (row.level === "capability") {
      for (const child of targets) {
        if (child.parentId === row.id) keep.add(child.id);
      }
    }
  }
  return targets.filter((row) => keep.has(row.id));
}

const LINKABLE_TO_TYPES = new Set(["application", "cloud_service", "solution", "technical_capability"]);

function isCapabilitySupportRel(rel: { type: string; from_type?: string; to_type?: string }) {
  return rel.type === SUPPORTED_BY && rel.from_type === "capability" && LINKABLE_TO_TYPES.has(rel.to_type ?? "application");
}

export type CapabilitySyncPlan = {
  keepRelIds: string[];
  deleteRelIds: string[];
  createIds: string[];
};

/** Keep existing links as-is (including fitness). Only create missing ones and delete unchecked ones. */
export function planSystemCapabilitySync(
  existing: { id: string; type: string; from_object_id: string; from_type?: string; to_type?: string }[],
  selectedIds: string[],
  knownIds: Set<string>
): CapabilitySyncPlan {
  const selected = new Set(selectedIds.filter((id) => knownIds.has(id)));
  const keepRelIds: string[] = [];
  const deleteRelIds: string[] = [];
  const present = new Set<string>();

  for (const rel of existing) {
    if (!isCapabilitySupportRel(rel)) continue;
    if (!knownIds.has(rel.from_object_id)) continue;
    if (selected.has(rel.from_object_id)) {
      keepRelIds.push(rel.id);
      present.add(rel.from_object_id);
    } else {
      deleteRelIds.push(rel.id);
    }
  }

  return {
    keepRelIds,
    deleteRelIds,
    createIds: [...selected].filter((id) => !present.has(id)),
  };
}
