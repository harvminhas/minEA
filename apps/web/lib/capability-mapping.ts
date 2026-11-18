/** Types a capability or activity can be linked to, and how those links are stored. */

import { relationshipLabelFor, type ObjectType, type RelationshipType } from "@minea/types";
import { uiTypeLabel } from "@/lib/ui-type-labels";

export type MappingKind = "relationship" | "process" | "product" | "people";
export type RelDirection = "outbound" | "inverse";
export type FitnessKind = "strong" | "adequate" | "weak";
export type PeopleRole = "owns" | "informed";

export type MappingRel = {
  type: RelationshipType;
  direction: RelDirection;
  label: string;
};

export type MappingType = {
  key: string;
  label: string;
  kind: MappingKind;
  /** Catalog object type to search, when kind is relationship. */
  objectType?: string;
  /** Applications also include solutions and technical capabilities. */
  searchTypes?: string[];
  defaultRel?: MappingRel;
  extraRels?: MappingRel[];
  createInline: boolean;
  /** Type-specific field besides the default relationship. */
  fields?: "fitness" | "peopleRole" | "dataVerb";
};

const outbound = (type: RelationshipType, label: string): MappingRel => ({ type, direction: "outbound", label });
const inverse = (type: RelationshipType, label: string): MappingRel => ({ type, direction: "inverse", label });

/** Picker order: apps first, then every type Harvinder approved. */
export const CAPABILITY_MAPPING_TYPES: MappingType[] = [
  {
    key: "application",
    label: "Applications",
    kind: "relationship",
    objectType: "application",
    searchTypes: ["application", "solution", "technical_capability"],
    defaultRel: outbound("supported_by", "Supported by"),
    createInline: true,
    fields: "fitness",
  },
  { key: "process", label: "Processes", kind: "process", createInline: true },
  {
    key: "data_object",
    label: "Data entities",
    kind: "relationship",
    objectType: "data_object",
    defaultRel: outbound("reads", "Reads"),
    extraRels: [outbound("creates", "Creates")],
    createInline: true,
    fields: "dataVerb",
  },
  { key: "people", label: "People & teams", kind: "people", createInline: true, fields: "peopleRole" },
  {
    key: "agent",
    label: "AI agents",
    kind: "relationship",
    objectType: "agent",
    defaultRel: inverse("supports", "Supports"),
    createInline: true,
  },
  {
    key: "cloud_service",
    label: "Platforms & cloud",
    kind: "relationship",
    objectType: "cloud_service",
    defaultRel: outbound("supported_by", "Supported by"),
    createInline: true,
    fields: "fitness",
  },
  {
    key: "external_party",
    label: "Vendors & contracts",
    kind: "relationship",
    objectType: "external_party",
    defaultRel: outbound("supplied_by", "Supplied by"),
    createInline: true,
  },
  { key: "product", label: "Products", kind: "product", createInline: true },
  {
    key: "location",
    label: "Locations",
    kind: "relationship",
    objectType: "location",
    defaultRel: outbound("located_at", "Located at"),
    createInline: true,
  },
  {
    key: "capability",
    label: "Capabilities",
    kind: "relationship",
    objectType: "capability",
    defaultRel: outbound("depends_on", "Depends on"),
    createInline: false,
  },
  {
    key: "data_store",
    label: "Data stores",
    kind: "relationship",
    objectType: "data_store",
    defaultRel: outbound("reads", "Reads"),
    extraRels: [outbound("writes", "Writes")],
    createInline: true,
    fields: "dataVerb",
  },
  {
    key: "data_domain",
    label: "Data domains",
    kind: "relationship",
    objectType: "data_domain",
    defaultRel: outbound("belongs_to", "Belongs to"),
    createInline: true,
  },
  {
    key: "roadmap_item",
    label: "Roadmaps",
    kind: "relationship",
    objectType: "roadmap_item",
    defaultRel: inverse("affects", "Affects"),
    createInline: true,
  },
  {
    key: "model",
    label: "Servers & devices",
    kind: "relationship",
    objectType: "model",
    defaultRel: outbound("supported_by", "Supported by"),
    createInline: true,
    fields: "fitness",
  },
];

export function mappingTypeByKey(key: string): MappingType | undefined {
  return CAPABILITY_MAPPING_TYPES.find((item) => item.key === key);
}

export function relationshipEnds(
  mapping: MappingType,
  targetId: string,
  targetType: string,
  capabilityId: string,
  rel: MappingRel = mapping.defaultRel ?? outbound("supported_by", "Supported by")
): { type: RelationshipType; from_object_id: string; from_type: ObjectType; to_object_id: string; to_type: ObjectType } {
  const objectType = targetType as ObjectType;
  if (rel.direction === "inverse") {
    return {
      type: rel.type,
      from_object_id: targetId,
      from_type: objectType,
      to_object_id: capabilityId,
      to_type: "capability",
    };
  }
  return {
    type: rel.type,
    from_object_id: capabilityId,
    from_type: "capability",
    to_object_id: targetId,
    to_type: objectType,
  };
}

export type MappedScope = { id: string; name: string; level: "capability" | "activity" };

export type MappedLink = {
  id: string;
  kind: MappingKind;
  groupKey: string;
  groupLabel: string;
  name: string;
  targetType: string;
  targetId: string;
  scopeId: string;
  scopeName: string;
  scopeLevel: "capability" | "activity";
  relationshipLabel: string;
  fitness?: FitnessKind;
  peopleRole?: PeopleRole;
};

export function scopePhrase(scopeLevel: "capability" | "activity", scopeName: string, currentCapabilityId?: string, scopeId?: string): string {
  if (scopeLevel === "capability" && currentCapabilityId && currentCapabilityId === scopeId) {
    return "on this capability";
  }
  return `on ${scopeName}`;
}

export function groupMappedLinks(links: MappedLink[]): { key: string; label: string; items: MappedLink[] }[] {
  const order = CAPABILITY_MAPPING_TYPES.map((item) => item.key);
  const buckets = new Map<string, MappedLink[]>();
  for (const link of links) {
    const list = buckets.get(link.groupKey) ?? [];
    list.push(link);
    buckets.set(link.groupKey, list);
  }
  const groups: { key: string; label: string; items: MappedLink[] }[] = [];
  for (const key of order) {
    const items = buckets.get(key);
    if (!items?.length) continue;
    items.sort((a, b) => a.name.localeCompare(b.name) || a.scopeName.localeCompare(b.scopeName));
    groups.push({ key, label: items[0]!.groupLabel, items });
  }
  for (const [key, items] of buckets) {
    if (order.includes(key)) continue;
    items.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ key, label: items[0]!.groupLabel, items });
  }
  return groups;
}

export type RelEdge = {
  id: string;
  type: string;
  from_object_id: string;
  from_type?: string;
  to_object_id: string;
  to_type?: string;
  attributes?: Record<string, unknown> | null;
};

export type NamedRecord = { id: string; name: string; type?: string };

const APP_TYPES = new Set(["application", "solution", "technical_capability"]);

function groupKeyForObjectType(type: string): string {
  if (APP_TYPES.has(type)) return "application";
  return type;
}

function parseFitness(attributes?: Record<string, unknown> | null): FitnessKind | undefined {
  const value = attributes?.fitness;
  if (value === "strong" || value === "adequate" || value === "weak") return value;
  return undefined;
}

export function mappedLinksFromRelationships(
  edges: RelEdge[],
  scopes: MappedScope[],
  records: NamedRecord[],
  currentCapabilityId?: string
): MappedLink[] {
  const scopeIds = new Set(scopes.map((item) => item.id));
  const scopeById = new Map(scopes.map((item) => [item.id, item]));
  const recordById = new Map(records.map((item) => [item.id, item]));
  const links: MappedLink[] = [];

  for (const edge of edges) {
    const fromIsScope = scopeIds.has(edge.from_object_id);
    const toIsScope = scopeIds.has(edge.to_object_id);
    if (fromIsScope === toIsScope) continue;
    const scopeId = fromIsScope ? edge.from_object_id : edge.to_object_id;
    const otherId = fromIsScope ? edge.to_object_id : edge.from_object_id;
    const other = recordById.get(otherId);
    const otherType = other?.type ?? (fromIsScope ? edge.to_type : edge.from_type) ?? "application";
    const scope = scopeById.get(scopeId);
    if (!scope) continue;
    const key = groupKeyForObjectType(otherType);
    const mapping = mappingTypeByKey(key);
    const words = relationshipLabelFor(edge.type, edge.from_type, edge.to_type);
    const relLabel = fromIsScope ? words.forward : words.reverse;
    const fitness = parseFitness(edge.attributes);
    const fitnessLabel = fitness ? fitness.charAt(0).toUpperCase() + fitness.slice(1) : "";
    links.push({
      id: edge.id,
      kind: "relationship",
      groupKey: key,
      groupLabel: mapping?.label ?? uiTypeLabel(otherType),
      name: other?.name ?? otherId,
      targetType: otherType,
      targetId: otherId,
      scopeId: scope.id,
      scopeName: scope.name,
      scopeLevel: scope.level,
      relationshipLabel: [relLabel, fitnessLabel, scopePhrase(scope.level, scope.name, currentCapabilityId, scope.id)]
        .filter(Boolean)
        .join(" · "),
      fitness,
    });
  }
  return links;
}

export type ProcessLike = {
  id: string;
  name: string;
  stages?: { capability_ids?: string[] }[];
};

export function mappedLinksFromProcesses(processes: ProcessLike[], scopes: MappedScope[], currentCapabilityId?: string): MappedLink[] {
  const scopeById = new Map(scopes.map((item) => [item.id, item]));
  const links: MappedLink[] = [];
  for (const process of processes) {
    const capIds = new Set((process.stages ?? []).flatMap((stage) => stage.capability_ids ?? []));
    for (const scopeId of capIds) {
      const scope = scopeById.get(scopeId);
      if (!scope) continue;
      links.push({
        id: `process:${process.id}:${scopeId}`,
        kind: "process",
        groupKey: "process",
        groupLabel: "Processes",
        name: process.name,
        targetType: "process",
        targetId: process.id,
        scopeId: scope.id,
        scopeName: scope.name,
        scopeLevel: scope.level,
        relationshipLabel: `Uses · ${scopePhrase(scope.level, scope.name, currentCapabilityId, scope.id)}`,
      });
    }
  }
  return links;
}

export type ProductLike = { id: string; name: string; capability_ids?: string[] };

export function mappedLinksFromProducts(products: ProductLike[], scopes: MappedScope[], currentCapabilityId?: string): MappedLink[] {
  const scopeById = new Map(scopes.map((item) => [item.id, item]));
  const links: MappedLink[] = [];
  for (const product of products) {
    for (const scopeId of product.capability_ids ?? []) {
      const scope = scopeById.get(scopeId);
      if (!scope) continue;
      links.push({
        id: `product:${product.id}:${scopeId}`,
        kind: "product",
        groupKey: "product",
        groupLabel: "Products",
        name: product.name,
        targetType: "product",
        targetId: product.id,
        scopeId: scope.id,
        scopeName: scope.name,
        scopeLevel: scope.level,
        relationshipLabel: `Realises · ${scopePhrase(scope.level, scope.name, currentCapabilityId, scope.id)}`,
      });
    }
  }
  return links;
}

export type AccountabilityLike = {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_name: string;
  link_kind: string;
  entity_id?: string;
};

export function mappedLinksFromPeople(
  items: AccountabilityLike[],
  scopes: MappedScope[],
  currentCapabilityId?: string
): MappedLink[] {
  const scopeById = new Map(scopes.map((item) => [item.id, item]));
  const links: MappedLink[] = [];
  for (const item of items) {
    const scope = item.entity_id ? scopeById.get(item.entity_id) : undefined;
    if (!scope) continue;
    const role = item.link_kind === "informed" ? "informed" : "owns";
    const roleLabel = role === "informed" ? "Informed" : "Owner";
    const subjectLabel = item.subject_type === "team" ? "Team" : item.subject_type === "role" ? "Role" : "Person";
    links.push({
      id: item.id,
      kind: "people",
      groupKey: "people",
      groupLabel: "People & teams",
      name: item.subject_name,
      targetType: item.subject_type,
      targetId: item.subject_id,
      scopeId: scope.id,
      scopeName: scope.name,
      scopeLevel: scope.level,
      relationshipLabel: `${roleLabel} · ${subjectLabel} · ${scopePhrase(scope.level, scope.name, currentCapabilityId, scope.id)}`,
      peopleRole: role,
    });
  }
  return links;
}

export function offerCreateInline(mapping: MappingType, query: string, existingNames: string[]): boolean {
  const trimmed = query.trim();
  if (!mapping.createInline || !trimmed) return false;
  return !existingNames.some((name) => name.toLowerCase() === trimmed.toLowerCase());
}
