import {
  OBJECT_TYPE_LABELS,
  type ObjectType,
  type Relationship,
  type RelationshipType,
} from "@minea/types";

const RELATIONSHIP_VERBS: Partial<Record<RelationshipType, string>> = {
  runs_on: "runs on",
  supported_by: "is supported by",
  affects: "affects",
  exposes: "exposes",
  consumes: "consumes",
  part_of: "is part of",
  resolves: "resolves",
  depends_on: "depends on",
  calls: "calls",
  uses: "uses",
  stores_in: "stores data in",
  publishes: "publishes",
  subscribes: "subscribes to",
  built_on: "is built on",
  supports: "supports",
  connects: "connects to",
  connects_to: "connects to",
  uses_model: "uses model",
  can_call: "can call",
  contains: "contains",
  routes: "routes to",
  accesses: "accesses",
  escalates_to: "escalates to",
  replaces: "replaces",
};

const OUTBOUND_LABELS: Partial<Record<RelationshipType, (name: string) => string>> = {
  runs_on: (n) => `Runs on ${n}`,
  supported_by: (n) => `Supports ${n}`,
  affects: (n) => `Affects ${n}`,
  exposes: (n) => `Exposes ${n}`,
  consumes: (n) => `Consumes ${n}`,
  part_of: (n) => `Part of ${n}`,
  resolves: (n) => `Resolves ${n}`,
  depends_on: (n) => `Depends on ${n}`,
  calls: (n) => `Calls ${n}`,
  uses: (n) => `Uses ${n}`,
  stores_in: (n) => `Stores data in ${n}`,
  publishes: (n) => `Publishes ${n}`,
  subscribes: (n) => `Subscribes to ${n}`,
  built_on: (n) => `Built on ${n}`,
  supports: (n) => `Supports ${n}`,
  connects: (n) => `Connects to ${n}`,
  connects_to: (n) => `Connects to ${n}`,
  uses_model: (n) => `Uses model ${n}`,
  can_call: (n) => `Can call ${n}`,
  contains: (n) => `Contains ${n}`,
  routes: (n) => `Routes to ${n}`,
  accesses: (n) => `Accesses ${n}`,
  escalates_to: (n) => `Escalates to ${n}`,
  replaces: (n) => `Replaces ${n}`,
};

const INBOUND_LABELS: Partial<Record<RelationshipType, (name: string) => string>> = {
  supported_by: (n) => `Supported by ${n}`,
  affects: (n) => `Affected by ${n}`,
  runs_on: (n) => `Hosts ${n}`,
  consumes: (n) => `Used by ${n}`,
  exposes: (n) => `Exposed by ${n}`,
  part_of: (n) => `Includes ${n}`,
  resolves: (n) => `Resolved by ${n}`,
  depends_on: (n) => `Required by ${n}`,
  calls: (n) => `Called by ${n}`,
  uses: (n) => `Used by ${n}`,
  stores_in: (n) => `Stores data for ${n}`,
  publishes: (n) => `Published by ${n}`,
  subscribes: (n) => `Subscribed by ${n}`,
  supports: (n) => `Supported by ${n}`,
  connects: (n) => `Connected from ${n}`,
  connects_to: (n) => `Connected from ${n}`,
  contains: (n) => `Contained in ${n}`,
  routes: (n) => `Routed from ${n}`,
  built_on: (n) => `Platform for ${n}`,
  uses_model: (n) => `Model used by ${n}`,
  can_call: (n) => `Callable by ${n}`,
  accesses: (n) => `Accessed by ${n}`,
  escalates_to: (n) => `Escalated from ${n}`,
  replaces: (n) => `Replaced by ${n}`,
};

export function isTechDebtRelationship(rel: Relationship): boolean {
  return rel.from_type === "tech_debt" || rel.to_type === "tech_debt";
}

export function excludeTechDebtRelationships(rels: Relationship[]): Relationship[] {
  return rels.filter((r) => !isTechDebtRelationship(r));
}

export function otherRelationshipObjectId(rel: Relationship, currentObjectId: string): string {
  return rel.from_object_id === currentObjectId ? rel.to_object_id : rel.from_object_id;
}

export function otherRelationshipObjectType(
  rel: Relationship,
  currentObjectId: string
): ObjectType {
  return rel.from_object_id === currentObjectId ? rel.to_type : rel.from_type;
}

export function relationshipEndpointLabel(type: ObjectType): string {
  if (type === "application") return "System";
  return OBJECT_TYPE_LABELS[type] ?? type;
}

export function relationshipVerb(type: RelationshipType): string {
  return RELATIONSHIP_VERBS[type] ?? type.replace(/_/g, " ");
}

export function formatRelationshipTriple(
  rel: Relationship,
  currentObjectId: string,
  currentName: string,
  otherName: string
): { nameLine: string; typeLine: string } {
  const fromName =
    rel.from_object_id === currentObjectId ? currentName : otherName;
  const toName = rel.to_object_id === currentObjectId ? currentName : otherName;
  const verb = relationshipVerb(rel.type);
  const fromType = relationshipEndpointLabel(rel.from_type);
  const toType = relationshipEndpointLabel(rel.to_type);

  return {
    nameLine: `${fromName} → ${verb} → ${toName}`,
    typeLine: `${fromType} → ${verb} → ${toType}`,
  };
}

export function describeRelationship(
  rel: Relationship,
  currentObjectId: string,
  otherName: string
): { label: string; typeLabel: string } {
  const outbound = rel.from_object_id === currentObjectId;
  const otherType = otherRelationshipObjectType(rel, currentObjectId);
  const format = outbound ? OUTBOUND_LABELS[rel.type] : INBOUND_LABELS[rel.type];
  const fallback = outbound ? `Links to ${otherName}` : `Linked from ${otherName}`;

  return {
    label: format ? format(otherName) : fallback,
    typeLabel: OBJECT_TYPE_LABELS[otherType] ?? otherType,
  };
}

export function relationshipFitnessLabel(rel: Relationship): string | null {
  const fitness = rel.attributes?.fitness;
  if (typeof fitness !== "string" || fitness === "none") return null;
  return fitness.charAt(0).toUpperCase() + fitness.slice(1);
}
