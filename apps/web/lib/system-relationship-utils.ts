import { excludeTechDebtRelationships, relationshipVerb } from "@/lib/relationship-display";
import type { MinEAObject, ObjectType, Relationship, RelationshipType } from "@minea/types";

export type SystemDiagramLink = {
  objectId: string;
  name: string;
  objectType: ObjectType;
  relationshipType: RelationshipType;
  direction: "outbound" | "inbound";
};

/** One diagram node per linked object and direction, with all relationship verbs combined. */
export type MergedSystemDiagramLink = {
  objectId: string;
  name: string;
  objectType: ObjectType;
  direction: "outbound" | "inbound";
  relationshipTypes: RelationshipType[];
};

const RELATIONSHIP_DIAGRAM_ORDER: Partial<Record<RelationshipType, number>> = {
  owns: 0,
  creates: 1,
  updates: 2,
  writes: 3,
  reads: 4,
  belongs_to: 5,
  runs_on: 3,
  built_on: 4,
  part_of: 5,
  calls: 6,
  consumes: 7,
  exposes: 8,
  publishes: 9,
  subscribes: 10,
  uses: 11,
  supported_by: 12,
  supports: 13,
  contains: 14,
  connects: 15,
  connects_to: 16,
  accesses: 17,
  replaces: 18,
  uses_model: 19,
  can_call: 20,
  escalates_to: 21,
  affects: 22,
  resolves: 23,
  depends_on: 24,
  routes: 25,
  hosts: 26,
  carries: 27,
};

function sortRelationshipTypes(types: RelationshipType[]): RelationshipType[] {
  return [...types].sort((a, b) => {
    const orderA = RELATIONSHIP_DIAGRAM_ORDER[a] ?? 50;
    const orderB = RELATIONSHIP_DIAGRAM_ORDER[b] ?? 50;
    if (orderA !== orderB) return orderA - orderB;
    return relationshipVerb(a).localeCompare(relationshipVerb(b));
  });
}

export function mergeSystemDiagramLinks(links: SystemDiagramLink[]): MergedSystemDiagramLink[] {
  const map = new Map<string, MergedSystemDiagramLink>();

  for (const link of links) {
    const key = `${link.objectId}:${link.direction}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.relationshipTypes.includes(link.relationshipType)) {
        existing.relationshipTypes.push(link.relationshipType);
      }
      continue;
    }
    map.set(key, {
      objectId: link.objectId,
      name: link.name,
      objectType: link.objectType,
      direction: link.direction,
      relationshipTypes: [link.relationshipType],
    });
  }

  for (const merged of map.values()) {
    merged.relationshipTypes = sortRelationshipTypes(merged.relationshipTypes);
  }

  return [...map.values()];
}

export function mergedSystemDiagramEdgeLabel(link: MergedSystemDiagramLink): string {
  return link.relationshipTypes.map((type) => relationshipVerb(type)).join(", ");
}

export function systemDiagramNodeId(link: Pick<MergedSystemDiagramLink, "objectId" | "direction">): string {
  return `link-${link.objectId}-${link.direction}`;
}

/** Object types shown on the system relationship diagram. */
export const SYSTEM_DIAGRAM_OBJECT_TYPES = new Set<ObjectType>([
  "application",
  "solution",
  "technical_capability",
  "component",
  "data_object",
  "data_store",
  "data_domain",
  "cloud_service",
  "model",
  "tool",
  "message_broker",
  "api",
  "event",
  "capability",
]);

export function extractSystemDiagramLinks(
  systemId: string,
  relationships: Relationship[],
  nameById: Record<string, string>
): SystemDiagramLink[] {
  const links: SystemDiagramLink[] = [];

  for (const rel of excludeTechDebtRelationships(relationships)) {
    if (rel.from_object_id === systemId) {
      if (!SYSTEM_DIAGRAM_OBJECT_TYPES.has(rel.to_type)) continue;
      links.push({
        objectId: rel.to_object_id,
        name: nameById[rel.to_object_id] ?? "Unknown",
        objectType: rel.to_type,
        relationshipType: rel.type,
        direction: "outbound",
      });
      continue;
    }
    if (rel.to_object_id === systemId) {
      if (!SYSTEM_DIAGRAM_OBJECT_TYPES.has(rel.from_type)) continue;
      links.push({
        objectId: rel.from_object_id,
        name: nameById[rel.from_object_id] ?? "Unknown",
        objectType: rel.from_type,
        relationshipType: rel.type,
        direction: "inbound",
      });
    }
  }

  return links;
}

export function systemRelationshipSummary(system: MinEAObject, links: SystemDiagramLink[]): string {
  if (links.length === 0) return "No linked objects yet — add connections from the diagram.";
  const merged = mergeSystemDiagramLinks(links);
  const byType = new Map<ObjectType, number>();
  for (const link of merged) {
    byType.set(link.objectType, (byType.get(link.objectType) ?? 0) + 1);
  }
  const parts = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${count} ${type.replace(/_/g, " ")}${count === 1 ? "" : "s"}`);
  const relPhrase = `${links.length} relationship${links.length === 1 ? "" : "s"}`;
  const objectPhrase = `${merged.length} linked object${merged.length === 1 ? "" : "s"}`;
  return `${relPhrase} · ${objectPhrase} · ${parts.join(" · ")}`;
}
