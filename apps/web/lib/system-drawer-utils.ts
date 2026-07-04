import { otherRelationshipObjectId } from "@/lib/relationship-display";
import type { ObjectType, Relationship, RelationshipType } from "@minea/types";

export interface SystemDrawerLink {
  relationshipId: string;
  objectId: string;
  objectType: ObjectType;
  relationshipType: RelationshipType;
  direction: "outbound" | "inbound";
}

const DATA_ENTITY_TYPES = new Set<ObjectType>(["data_object"]);
const DATA_STORE_TYPES = new Set<ObjectType>(["data_store"]);
const DATA_DOMAIN_TYPES = new Set<ObjectType>(["data_domain"]);

const SYSTEM_LINK_TYPES = new Set<ObjectType>(["application", "solution", "technical_capability"]);
const COMPONENT_LINK_TYPES = new Set<ObjectType>(["component"]);
const PLATFORM_LINK_TYPES = new Set<ObjectType>(["cloud_service"]);
const CAPABILITY_LINK_TYPES = new Set<ObjectType>(["capability"]);
const API_LINK_TYPES = new Set<ObjectType>(["api"]);
const EVENT_LINK_TYPES = new Set<ObjectType>(["event"]);

function extractLinksForTypes(
  systemId: string,
  relationships: Relationship[],
  targetTypes: Set<ObjectType>,
  options?: { excludeSelf?: boolean }
): SystemDrawerLink[] {
  const links: SystemDrawerLink[] = [];
  const seen = new Set<string>();

  for (const rel of relationships) {
    let objectId: string | null = null;
    let objectType: ObjectType | null = null;
    let direction: "outbound" | "inbound" | null = null;

    if (rel.from_object_id === systemId && targetTypes.has(rel.to_type)) {
      objectId = rel.to_object_id;
      objectType = rel.to_type;
      direction = "outbound";
    } else if (rel.to_object_id === systemId && targetTypes.has(rel.from_type)) {
      objectId = rel.from_object_id;
      objectType = rel.from_type;
      direction = "inbound";
    }

    if (!objectId || !objectType || !direction) continue;
    if (options?.excludeSelf && objectId === systemId) continue;

    const dedupeKey = `${objectId}:${rel.type}:${direction}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    links.push({
      relationshipId: rel.id,
      objectId,
      objectType,
      relationshipType: rel.type,
      direction,
    });
  }

  return links.sort((a, b) => a.objectId.localeCompare(b.objectId));
}

export function systemDataEntityLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, DATA_ENTITY_TYPES);
}

export function systemDataStoreLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, DATA_STORE_TYPES);
}

export function systemDataDomainLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, DATA_DOMAIN_TYPES);
}

export function systemObjectSystemLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, SYSTEM_LINK_TYPES, { excludeSelf: true });
}

export function systemObjectComponentLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, COMPONENT_LINK_TYPES);
}

export function systemObjectPlatformLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, PLATFORM_LINK_TYPES);
}

export function systemObjectCapabilityLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, CAPABILITY_LINK_TYPES);
}

export function systemObjectApiLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, API_LINK_TYPES);
}

export function systemObjectEventLinks(systemId: string, relationships: Relationship[]) {
  return extractLinksForTypes(systemId, relationships, EVENT_LINK_TYPES);
}

/** All non-data object-link types shown on the relationship map preview. */
export function systemDiagramRelationshipIds(systemId: string, relationships: Relationship[]): string[] {
  const ids = new Set<string>();
  for (const rel of relationships) {
    ids.add(otherRelationshipObjectId(rel, systemId));
  }
  return [...ids];
}
