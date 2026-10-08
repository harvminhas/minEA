import { REGISTRY, recordTypeOf } from "@/lib/fields/registry";

export const FIELD_MANAGED_EDGES = ["built_on", "runs_on", "located_at", "supplied_by", "authenticates_via"] as const;

const CREATABLE = new Set(["cloud_service", "model", "location", "external_party"]);

/** Clearing a supplied_by link from the record that owns the Vendor field. */
export function suppliedByVendorClear(
  rel: { type: string; from_object_id: string },
  objectId: string,
): { properties: { vendor: null } } | null {
  if (rel.type !== "supplied_by" || rel.from_object_id !== objectId) return null;
  return { properties: { vendor: null } };
}

export function isFieldManagedEdge(type: string): boolean {
  return (FIELD_MANAGED_EDGES as readonly string[]).includes(type);
}

/** The Details tag, only on the record that owns the outgoing field. */
export function alsoInDetailsLabel(
  rel: { type: string; from_object_id: string },
  objectId: string,
  objectType: string | null | undefined,
): string | null {
  if (rel.from_object_id !== objectId) return null;
  return detailsFieldName(rel.type, objectType ?? null);
}

/** The Details label for a link that is also a field, when this record has that field. */
export function detailsFieldName(edge: string, objectType: string | null): string | null {
  if (!isFieldManagedEdge(edge) || !objectType) return null;
  const recordType = recordTypeOf(objectType);
  if (!recordType) return null;
  const field = REGISTRY[recordType].find(
    (item) => item.source.kind === "rel" && item.source.edge === edge && item.source.dir === "out"
  );
  return field?.label ?? null;
}

export function detailsAlsoSetsHint(edge: string, objectType: string | null): string | null {
  const name = detailsFieldName(edge, objectType);
  if (!name) return null;
  return `This also sets ${name} in Details`;
}

/** Offer to create a platform, server, location, or vendor when the typed name is not already listed and the field has one target type. */
export function relationCreateLabel(
  targets: readonly string[],
  query: string,
  choiceNames: readonly string[]
): string | null {
  const name = query.trim();
  if (!name || targets.length !== 1 || !CREATABLE.has(targets[0]!)) return null;
  const key = name.toLowerCase();
  if (choiceNames.some((item) => item.trim().toLowerCase() === key)) return null;
  return `+ Create '${name}'`;
}
