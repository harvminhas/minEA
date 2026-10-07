import type { ObjectUpdate, RelationshipCreate } from "@minea/types";
import type { FieldDef } from "@/lib/fields/registry";
import { ownershipFromEntity, ownershipToPayload, type OwnershipValue } from "@/lib/owner-fields";
import { isSystemObjectType } from "@/lib/platform-relationship-utils";
import { lifecycleToStatus } from "@/lib/platform-utils";

export type FieldEdge = {
  id: string;
  type: string;
  from_object_id: string;
  from_type: string;
  to_object_id: string;
  to_type: string;
};

export type FieldRecord = {
  id: string;
  type: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  tags?: string[] | null;
  owner?: string | null;
  owner_team_id?: string | null;
  owner_team_name?: string | null;
  point_of_contact_id?: string | null;
  point_of_contact_name?: string | null;
  email?: string | null;
  team_id?: string | null;
  lead?: string | null;
  properties: Record<string, unknown>;
  edges?: FieldEdge[];
};

/** Owner stays optional for a shadow application. Other required flags are unchanged. */
export function fieldIsRequired(def: FieldDef, record: { properties?: Record<string, unknown> | null }): boolean {
  if (def.key === "owner" && record.properties?.governance_status === "shadow") return false;
  return Boolean(def.required);
}

export type FieldPatch = {
  object?: ObjectUpdate;
  people?: Record<string, unknown>;
  addRel?: RelationshipCreate[];
  removeRelIds?: string[];
};

const LIFECYCLE_TYPES = new Set(["model", "cloud_service", "tool"]);

export function sameFieldValue(stored: unknown, next: unknown): boolean {
  if (Array.isArray(stored) || Array.isArray(next)) {
    const list = (value: unknown) =>
      Array.isArray(value) ? value.map(String) : value == null || value === "" ? [] : [String(value)];
    const left = list(stored);
    const right = list(next);
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  if (stored && typeof stored === "object" && next && typeof next === "object") {
    const left = stored as OwnershipValue;
    const right = next as OwnershipValue;
    return (
      left.ownerTeamId === right.ownerTeamId &&
      left.ownerTeamName === right.ownerTeamName &&
      left.pointOfContactId === right.pointOfContactId &&
      left.pointOfContactName === right.pointOfContactName
    );
  }
  return (stored == null ? "" : String(stored)) === (next == null ? "" : String(next));
}

function blank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function relMatches(def: FieldDef, edge: FieldEdge, recordId: string): boolean {
  if (def.source.kind !== "rel" || edge.type !== def.source.edge) return false;
  if (def.source.dir === "out") {
    return edge.from_object_id === recordId && def.source.target.includes(edge.to_type);
  }
  return edge.to_object_id === recordId && def.source.target.includes(edge.from_type);
}

function relId(def: FieldDef, edge: FieldEdge): string {
  return def.source.kind === "rel" && def.source.dir === "in" ? edge.from_object_id : edge.to_object_id;
}

export function readField(def: FieldDef, record: FieldRecord, edges?: FieldEdge[]): unknown {
  const list = edges ?? record.edges ?? [];
  if (def.key === "is_custom_built") {
    const stored = record.properties.is_custom_built;
    if (stored === true || stored === "yes") return "yes";
    if (stored === false || stored === "no") return "no";
    return "";
  }
  if (def.source.kind === "column") {
    if (def.source.column === "tags") return record.tags ?? [];
    const value = record[def.source.column];
    return value == null ? "" : value;
  }
  if (def.source.kind === "prop") {
    const value = record.properties[def.source.key];
    if (value == null) return def.editor === "tags" || def.editor === "costLines" ? [] : "";
    return value;
  }
  if (def.source.kind === "owner") return ownershipFromEntity(record);
  if (def.source.kind === "people") {
    const value = record[def.source.field as keyof FieldRecord];
    return value == null ? "" : value;
  }
  if (def.source.kind === "rel") {
    const ids = list.filter((edge) => relMatches(def, edge, record.id)).map((edge) => relId(def, edge));
    return def.source.single ? (ids[0] ?? "") : ids;
  }
  return "";
}

export function toPatch(
  def: FieldDef,
  value: unknown,
  record: FieldRecord,
  edges: FieldEdge[],
  label?: string,
  typeOf?: (id: string) => string | undefined
): FieldPatch {
  const empty = blank(value);
  if (def.source.kind === "owner") {
    const next: OwnershipValue = empty
      ? { ownerTeamId: "", ownerTeamName: "", pointOfContactId: "", pointOfContactName: "" }
      : { ...ownershipFromEntity(record), ...(value as Partial<OwnershipValue>) };
    return { object: ownershipToPayload(next) };
  }
  if (def.source.kind === "people") {
    return { people: { [def.source.field]: empty ? null : value } };
  }
  if (def.source.kind === "column") {
    if (def.source.column === "tags") {
      return { object: { tags: empty ? [] : (value as string[]) } };
    }
    return { object: { [def.source.column]: empty ? null : value } as ObjectUpdate };
  }
  if (def.source.kind === "rel") {
    const source = def.source;
    const removeRelIds = edges.filter((edge) => relMatches(def, edge, record.id)).map((edge) => edge.id);
    const ids = empty ? [] : Array.isArray(value) ? value.map(String) : [String(value)];
    const incoming = source.dir === "in";
    const endType = (id: string): string => {
      const matched = edges.find(
        (edge) => relMatches(def, edge, record.id) && (incoming ? edge.from_object_id === id : edge.to_object_id === id)
      );
      const fromEdge = incoming ? matched?.from_type : matched?.to_type;
      for (const candidate of [typeOf?.(id), fromEdge]) {
        if (candidate && source.target.includes(candidate)) return candidate;
      }
      if (source.target.length === 1) return source.target[0]!;
      throw new Error(`Pick ${def.label.toLowerCase()} from the list`);
    };
    const addRel: RelationshipCreate[] = ids.map((id) =>
      incoming
        ? {
            type: source.edge as RelationshipCreate["type"],
            from_object_id: id,
            from_type: endType(id) as RelationshipCreate["from_type"],
            to_object_id: record.id,
            to_type: record.type as RelationshipCreate["to_type"],
          }
        : {
            type: source.edge as RelationshipCreate["type"],
            from_object_id: record.id,
            from_type: record.type as RelationshipCreate["from_type"],
            to_object_id: id,
            to_type: endType(id) as RelationshipCreate["to_type"],
          }
    );
    if (def.key === "built_on" && isSystemObjectType(record.type)) {
      for (const edge of edges) {
        const legacyPlatform =
          edge.from_object_id === record.id &&
          edge.to_type === "cloud_service" &&
          isSystemObjectType(edge.from_type) &&
          (edge.type === "built_on" || edge.type === "runs_on");
        if (legacyPlatform && !removeRelIds.includes(edge.id)) removeRelIds.push(edge.id);
      }
    }
    const patch: FieldPatch = { addRel, removeRelIds };
    if (def.key === "vendor" && label !== undefined) {
      patch.object = { properties: { vendor: empty || !label ? null : label } };
    }
    if (def.key === "built_on" && record.type === "application") {
      patch.object = {
        properties: {
          platform: empty ? null : { platform_id: ids[0] ?? "", platform_name: "" },
        },
      };
    }
    return patch;
  }
  if (def.source.kind !== "prop") return {};

  const stored = def.key === "is_custom_built"
    ? (empty ? null : value === "yes")
    : (empty ? null : value);
  const properties: Record<string, unknown> = { [def.source.key]: stored };
  if (def.key === "access_method") properties.console_url = stored;
  const object: ObjectUpdate = { properties };
  if (def.key === "lifecycle" && LIFECYCLE_TYPES.has(record.type) && !empty) {
    object.status = lifecycleToStatus(String(value));
  }
  return { object };
}

export function applyPatch(record: FieldRecord, patch: FieldPatch, edges: FieldEdge[]): FieldRecord {
  const next: FieldRecord = {
    ...record,
    properties: { ...(record.properties ?? {}) },
    tags: record.tags ? [...record.tags] : [],
    edges: edges.map((edge) => ({ ...edge })),
  };
  const object = patch.object;
  if (object) {
    if ("name" in object) next.name = object.name ?? null;
    if ("description" in object) next.description = object.description ?? null;
    if ("status" in object) next.status = object.status ?? null;
    if ("tags" in object) next.tags = object.tags ?? [];
    if ("owner" in object) next.owner = object.owner ?? null;
    if ("owner_team_id" in object) next.owner_team_id = object.owner_team_id ?? null;
    if ("owner_team_name" in object) next.owner_team_name = object.owner_team_name ?? null;
    if ("point_of_contact_id" in object) next.point_of_contact_id = object.point_of_contact_id ?? null;
    if ("point_of_contact_name" in object) next.point_of_contact_name = object.point_of_contact_name ?? null;
    if (object.properties) {
      for (const [key, value] of Object.entries(object.properties)) {
        if (value === null) delete next.properties[key];
        else next.properties[key] = value;
      }
    }
  }
  if (patch.people) Object.assign(next, patch.people);
  const removed = new Set(patch.removeRelIds ?? []);
  next.edges = (next.edges ?? []).filter((edge) => !removed.has(edge.id));
  (patch.addRel ?? []).forEach((rel, index) => {
    next.edges!.push({
      id: `added-${index}-${rel.to_object_id}-${rel.from_object_id}`,
      type: rel.type,
      from_object_id: rel.from_object_id,
      from_type: rel.from_type,
      to_object_id: rel.to_object_id,
      to_type: rel.to_type,
    });
  });
  return next;
}
