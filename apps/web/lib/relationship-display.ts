import {
  OBJECT_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  type ObjectType,
  type Relationship,
  type RelationshipType,
} from "@minea/types";

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

/**
 * Words for a stored relationship type. A type this build doesn't know yet (a newer build
 * wrote it to the shared database) falls back to its own name instead of throwing.
 */
export function relationshipWords(type: string): { forward: string; reverse: string; sentence: (from: string, to: string) => string } {
  const known = (RELATIONSHIP_LABELS as Partial<Record<string, (typeof RELATIONSHIP_LABELS)[RelationshipType]>>)[type];
  if (known) return known;
  const plain = String(type ?? "").replaceAll("_", " ").trim() || "linked to";
  const forward = plain.charAt(0).toUpperCase() + plain.slice(1);
  return {
    forward,
    reverse: `${forward} (from)`,
    sentence: (from, to) => `${from} ${plain} ${to}`,
  };
}

export function relationshipVerb(type: RelationshipType): string {
  return relationshipWords(type).forward.toLowerCase();
}

export function formatRelationshipTriple(
  rel: Relationship,
  currentObjectId: string,
  currentName: string,
  otherName: string
): { nameLine: string; typeLine: string } {
  const fromName = rel.from_object_id === currentObjectId ? currentName : otherName;
  const toName = rel.to_object_id === currentObjectId ? currentName : otherName;
  const words = relationshipWords(rel.type);
  const outbound = rel.from_object_id === currentObjectId;
  const verb = relationshipVerb(rel.type);
  const fromType = relationshipEndpointLabel(rel.from_type);
  const toType = relationshipEndpointLabel(rel.to_type);

  return {
    nameLine: outbound ? `${words.forward} ${toName}` : `${words.reverse} ${fromName}`,
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
  const words = relationshipWords(rel.type);
  const phrase = outbound ? words.forward : words.reverse;

  return {
    label: `${phrase} ${otherName}`,
    typeLabel: OBJECT_TYPE_LABELS[otherType] ?? otherType,
  };
}

export function relationshipFitnessLabel(rel: Relationship): string | null {
  const fitness = rel.attributes?.fitness;
  if (typeof fitness !== "string" || fitness === "none") return null;
  return fitness.charAt(0).toUpperCase() + fitness.slice(1);
}
