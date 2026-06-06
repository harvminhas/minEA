import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import type { MinEAObject, ObjectType, Relationship, RelationshipType } from "@minea/types";

export type SystemDiagramLink = {
  objectId: string;
  name: string;
  objectType: ObjectType;
  relationshipType: RelationshipType;
  direction: "outbound" | "inbound";
};

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
  const byType = new Map<ObjectType, number>();
  for (const link of links) {
    byType.set(link.objectType, (byType.get(link.objectType) ?? 0) + 1);
  }
  const parts = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => `${count} ${type.replace(/_/g, " ")}${count === 1 ? "" : "s"}`);
  return `${links.length} connection${links.length === 1 ? "" : "s"} · ${parts.join(" · ")}`;
}
