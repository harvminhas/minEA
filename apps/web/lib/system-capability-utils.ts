import { relationshipsApi } from "@/lib/api-client";

const SUPPORTED_BY = "supported_by" as const;
const DEFAULT_FITNESS = "strong";

export async function loadSystemCapabilityIds(
  orgSlug: string,
  workspaceSlug: string,
  systemId: string,
  token: string
): Promise<string[]> {
  const rels = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: systemId },
    token
  );
  return rels
    .filter(
      (r) =>
        r.type === SUPPORTED_BY &&
        r.from_type === "capability" &&
        r.to_type === "application"
    )
    .map((r) => r.from_object_id);
}

export async function syncSystemCapabilityRelations(
  orgSlug: string,
  workspaceSlug: string,
  systemId: string,
  capabilityIds: string[],
  token: string
): Promise<void> {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: systemId },
    token
  );

  const selected = new Set(capabilityIds);

  for (const rel of existing) {
    if (
      rel.type === SUPPORTED_BY &&
      rel.from_type === "capability" &&
      rel.to_type === "application"
    ) {
      if (!selected.has(rel.from_object_id)) {
        await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
      }
    }
  }

  const existingCapIds = new Set(
    existing
      .filter(
        (r) =>
          r.type === SUPPORTED_BY &&
          r.from_type === "capability" &&
          r.to_type === "application"
      )
      .map((r) => r.from_object_id)
  );

  for (const capabilityId of capabilityIds) {
    if (existingCapIds.has(capabilityId)) continue;
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: SUPPORTED_BY,
        from_object_id: capabilityId,
        from_type: "capability",
        to_object_id: systemId,
        to_type: "application",
        attributes: { fitness: DEFAULT_FITNESS },
      },
      token
    );
  }
}
