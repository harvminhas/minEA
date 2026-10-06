export function relationshipsForObject<T extends { from_object_id: string; to_object_id: string }>(
  relationships: readonly T[],
  objectId: string
): T[] {
  return relationshipsForIds(relationships, [objectId]);
}

export function relationshipsForIds<T extends { from_object_id: string; to_object_id: string }>(
  relationships: readonly T[],
  objectIds: readonly string[]
): T[] {
  const wanted = new Set(objectIds);
  return relationships.filter((rel) => wanted.has(rel.from_object_id) || wanted.has(rel.to_object_id));
}

/** Same-name vendor parties share one Relationships list, so a platform link on either party shows. */
export function sameNamePartyIds(
  objects: readonly { id: string; type: string; name: string }[],
  partyId: string,
  partyType: string,
  partyName: string
): string[] {
  if (partyType !== "external_party") return [partyId];
  const key = partyName.trim().toLowerCase();
  const ids = objects
    .filter((object) => object.type === "external_party" && object.name.trim().toLowerCase() === key)
    .map((object) => object.id);
  if (!ids.includes(partyId)) ids.unshift(partyId);
  return ids;
}
