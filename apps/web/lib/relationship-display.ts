import {
  OBJECT_TYPE_LABELS,
  relationshipLabelFor,
  type ObjectType,
  type Relationship,
  type RelationshipLabel,
  type RelationshipType,
} from "@minea/types";
import { uiTypeLabel } from "@/lib/ui-type-labels";

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

/**
 * Words for a stored relationship type (per source/target type when the registry has an override).
 * A type this build doesn't know yet (a newer build wrote it to the shared database) falls back to
 * its own name instead of throwing.
 */
export function relationshipWords(type: string, fromType?: string | null, toType?: string | null): RelationshipLabel {
  return relationshipLabelFor(type, fromType, toType);
}

export function relationshipVerb(type: RelationshipType | string, fromType?: string | null, toType?: string | null): string {
  return relationshipWords(type, fromType, toType).forward.toLowerCase();
}

/** The phrase for this link as read from one of its ends: forward from the source, reverse from the target. */
export function relationshipPhrase(
  rel: Pick<Relationship, "type" | "from_object_id" | "from_type" | "to_type">,
  currentObjectId: string
): string {
  const words = relationshipWords(rel.type, rel.from_type, rel.to_type);
  return rel.from_object_id === currentObjectId ? words.forward : words.reverse;
}

/** The link as a sentence that starts with the current record ("Azure hosts Salesforce"). */
export function relationshipSentenceFrom(
  rel: Pick<Relationship, "type" | "from_object_id" | "from_type" | "to_type">,
  currentObjectId: string,
  currentName: string,
  otherName: string
): string {
  const words = relationshipWords(rel.type, rel.from_type, rel.to_type);
  return rel.from_object_id === currentObjectId
    ? words.sentence(currentName, otherName)
    : words.reverseSentence(otherName, currentName);
}

/**
 * One relationship as two lines read from the current record: nameLine "Hosts Salesforce" and
 * typeLine, the other item's kind in plain words ("Application"), never stored codes.
 */
export function formatRelationshipTriple(
  rel: Relationship,
  currentObjectId: string,
  currentName: string,
  otherName: string
): { nameLine: string; typeLine: string } {
  const outbound = rel.from_object_id === currentObjectId;
  const otherType = outbound ? rel.to_type : rel.from_type;
  const kind = uiTypeLabel(otherType, true);
  return {
    nameLine: `${relationshipPhrase(rel, currentObjectId)} ${otherName}`,
    typeLine: kind.charAt(0).toUpperCase() + kind.slice(1),
  };
}

export function describeRelationship(
  rel: Relationship,
  currentObjectId: string,
  otherName: string
): { label: string; typeLabel: string } {
  const otherType = otherRelationshipObjectType(rel, currentObjectId);

  return {
    label: `${relationshipPhrase(rel, currentObjectId)} ${otherName}`,
    typeLabel: OBJECT_TYPE_LABELS[otherType] ?? otherType,
  };
}

export function relationshipFitnessLabel(rel: Relationship): string | null {
  const fitness = rel.attributes?.fitness;
  if (typeof fitness !== "string" || fitness === "none") return null;
  return fitness.charAt(0).toUpperCase() + fitness.slice(1);
}
