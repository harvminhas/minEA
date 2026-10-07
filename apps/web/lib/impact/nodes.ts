import { OBJECT_TYPE_LABELS, type MinEAObject, type ObjectType, type Relationship } from "@minea/types";
import type { ImpactNode } from "@/lib/impact/relationship-impact";

function typeLabel(type: string): string {
  if (type === "location") return "Location";
  if (type === "external_party") return "Outside the company";
  if (type === "agent") return "AI agent";
  if (type === "ai_model") return "AI model";
  return OBJECT_TYPE_LABELS[type as ObjectType] ?? "Item";
}

function unnamed(type: string): Pick<ImpactNode, "name" | "typeLabel"> {
  const label = typeLabel(type);
  return { typeLabel: label, name: `Unnamed ${label.toLowerCase()}` };
}

/** Catalog rows, the fixed location/vendor/capability nodes, then every relationship end. */
export function impactNodes(
  rows: { id: string; name: string; typeLabel: string }[],
  objects: MinEAObject[],
  relationships: Relationship[]
): ImpactNode[] {
  const nodes = new Map<string, ImpactNode>();
  for (const row of rows) nodes.set(row.id, { id: row.id, name: row.name, typeLabel: row.typeLabel });
  for (const object of objects) {
    if (nodes.has(object.id)) continue;
    const capability = object.type === "capability" || object.type === "technical_capability";
    if (object.type === "location") nodes.set(object.id, { id: object.id, name: object.name, typeLabel: "Location" });
    else if (object.type === "external_party") nodes.set(object.id, { id: object.id, name: object.name, typeLabel: "Outside the company" });
    else if (capability || object.type === "component") {
      nodes.set(object.id, { id: object.id, name: object.name, typeLabel: OBJECT_TYPE_LABELS[object.type] ?? "Item" });
    }
  }
  const byId = new Map(objects.map((object) => [object.id, object]));
  const namedEnd = (id: string, type: string): ImpactNode => {
    const object = byId.get(id);
    const name = object?.name?.trim() ?? "";
    if (!object || !name) return { id, ...unnamed(type) };
    return { id, name, typeLabel: typeLabel(object.type) };
  };
  for (const rel of relationships) {
    if (!nodes.has(rel.from_object_id)) nodes.set(rel.from_object_id, namedEnd(rel.from_object_id, rel.from_type));
    if (!nodes.has(rel.to_object_id)) nodes.set(rel.to_object_id, namedEnd(rel.to_object_id, rel.to_type));
  }
  return [...nodes.values()];
}
