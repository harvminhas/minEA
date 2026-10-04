export function relationshipsForObject<T extends { from_object_id: string; to_object_id: string }>(
  relationships: readonly T[],
  objectId: string
): T[] {
  return relationships.filter((rel) => rel.from_object_id === objectId || rel.to_object_id === objectId);
}
