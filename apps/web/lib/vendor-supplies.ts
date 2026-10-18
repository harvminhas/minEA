import type { MinEAObject, Relationship, RelationshipCreate } from "@minea/types";

/** Item types that can be "Supplied by" a vendor (same list as the API's allowed triples). */
export const SUPPLIED_ITEM_TYPES = ["application", "solution", "technical_capability", "cloud_service", "model", "ai_model"] as const;

export type SuppliedItem = { id: string; name: string; linked: boolean };

/**
 * What a vendor supplies, read from the vendor's side: items linked by supplied_by, plus items whose
 * Vendor text names this vendor (older records that never got the link).
 */
export function suppliedItems(
  vendor: Pick<MinEAObject, "id" | "name">,
  objects: Pick<MinEAObject, "id" | "name" | "type" | "properties">[],
  relationships: Pick<Relationship, "type" | "from_object_id" | "to_object_id">[]
): SuppliedItem[] {
  const key = vendor.name.trim().toLowerCase();
  const linked = new Set(
    relationships.filter((rel) => rel.type === "supplied_by" && rel.to_object_id === vendor.id).map((rel) => rel.from_object_id)
  );
  const items: SuppliedItem[] = [];
  for (const obj of objects) {
    if (obj.id === vendor.id || !(SUPPLIED_ITEM_TYPES as readonly string[]).includes(obj.type)) continue;
    const text = String((obj.properties ?? {}).vendor ?? "").trim().toLowerCase();
    if (linked.has(obj.id) || (key && text === key)) items.push({ id: obj.id, name: obj.name, linked: linked.has(obj.id) });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export type SupplyPlan = {
  addRel: RelationshipCreate[];
  removeRelIds: string[];
  /** properties.vendor to write on the item (null clears it), or undefined to leave it. */
  vendorText: string | null | undefined;
};

/**
 * Add an item from the vendor's side. Still saved as item -[supplied_by]-> vendor, and an item has one
 * vendor, so the item's other supplied_by link is replaced and its Vendor text follows (same as editing
 * the item's own Vendor field).
 */
export function planSupplyAdd(
  vendor: Pick<MinEAObject, "id" | "name" | "type">,
  item: Pick<MinEAObject, "id" | "type">,
  relationships: Pick<Relationship, "id" | "type" | "from_object_id" | "to_object_id">[]
): SupplyPlan {
  const mine = relationships.filter((rel) => rel.type === "supplied_by" && rel.from_object_id === item.id);
  const already = mine.some((rel) => rel.to_object_id === vendor.id);
  return {
    addRel: already
      ? []
      : [
          {
            type: "supplied_by",
            from_object_id: item.id,
            from_type: item.type as RelationshipCreate["from_type"],
            to_object_id: vendor.id,
            to_type: vendor.type as RelationshipCreate["to_type"],
          },
        ],
    removeRelIds: mine.filter((rel) => rel.to_object_id !== vendor.id).map((rel) => rel.id),
    vendorText: vendor.name,
  };
}

/** Remove an item from the vendor's side: drop its link and clear Vendor text that names this vendor. */
export function planSupplyRemove(
  vendor: Pick<MinEAObject, "id" | "name">,
  item: Pick<MinEAObject, "id" | "properties">,
  relationships: Pick<Relationship, "id" | "type" | "from_object_id" | "to_object_id">[]
): SupplyPlan {
  const text = String((item.properties ?? {}).vendor ?? "").trim().toLowerCase();
  return {
    addRel: [],
    removeRelIds: relationships
      .filter((rel) => rel.type === "supplied_by" && rel.from_object_id === item.id && rel.to_object_id === vendor.id)
      .map((rel) => rel.id),
    vendorText: text && text === vendor.name.trim().toLowerCase() ? null : undefined,
  };
}
