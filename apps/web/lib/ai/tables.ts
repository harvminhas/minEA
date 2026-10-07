import type { MinEAObject, Relationship } from "@minea/types";
import { annualCost } from "@/lib/cost/service";

export type AiTableType = "agent" | "ai_model";

export type AiTableRow = { id: string; name: string; cells: string[] };

export const AI_TABLE_COLUMNS: Record<AiTableType, string[]> = {
  agent: ["Name", "Built with", "Model", "Reads / writes", "Owner", "Annual cost"],
  ai_model: ["Name", "Accessed through", "Vendor", "Used by", "Annual cost"],
};

const EMPTY = "—";

function linkedNames(
  relationships: Relationship[],
  objectId: string,
  type: string,
  byId: Map<string, MinEAObject>,
  outbound: boolean
): string {
  const names = relationships
    .filter((rel) => rel.type === type && (outbound ? rel.from_object_id === objectId : rel.to_object_id === objectId))
    .map((rel) => byId.get(outbound ? rel.to_object_id : rel.from_object_id)?.name?.trim() || "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return names.length ? names.join(", ") : EMPTY;
}

function ownerCell(object: MinEAObject): string {
  const value = object.owner_team_name || object.point_of_contact_name || object.owner;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || EMPTY;
}

function readsWrites(relationships: Relationship[], objectId: string): string {
  let reads = 0;
  let writes = 0;
  for (const rel of relationships) {
    if (rel.from_object_id !== objectId) continue;
    if (rel.type === "reads") reads += 1;
    if (rel.type === "writes") writes += 1;
  }
  if (reads === 0 && writes === 0) return EMPTY;
  return `${reads} read · ${writes} write`;
}

function usedBy(relationships: Relationship[], objectId: string): string {
  const count = relationships.filter((rel) => rel.type === "uses_model" && rel.to_object_id === objectId).length;
  if (count === 0) return EMPTY;
  return count === 1 ? "1 agent" : `${count} agents`;
}

function vendorCell(object: MinEAObject, relationships: Relationship[], byId: Map<string, MinEAObject>): string {
  const linked = linkedNames(relationships, object.id, "supplied_by", byId, true);
  if (linked !== EMPTY) return linked;
  const vendor = object.properties?.vendor;
  return typeof vendor === "string" && vendor.trim() ? vendor.trim() : EMPTY;
}

export function aiTableRows(type: AiTableType, objects: MinEAObject[], relationships: Relationship[]): AiTableRow[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  return objects
    .filter((object) => object.type === type)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((object) => {
      const name = object.name?.trim() || "Untitled";
      const cells =
        type === "agent"
          ? [
              name,
              linkedNames(relationships, object.id, "built_on", byId, true),
              linkedNames(relationships, object.id, "uses_model", byId, true),
              readsWrites(relationships, object.id),
              ownerCell(object),
              annualCost(object.properties).label,
            ]
          : [
              name,
              linkedNames(relationships, object.id, "runs_on", byId, true),
              vendorCell(object, relationships, byId),
              usedBy(relationships, object.id),
              annualCost(object.properties).label,
            ];
      return { id: object.id, name, cells };
    });
}
