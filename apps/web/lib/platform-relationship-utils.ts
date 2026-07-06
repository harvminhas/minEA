import type { CloudServiceProperties, MinEAObject, ObjectType, PlatformRef, Relationship } from "@minea/types";
import { relationshipsApi } from "@/lib/api-client";
import { isEnterprisePlatform } from "@/lib/platform-utils";

/** System → enterprise platform (sys built on platform). */
export const SYSTEM_PLATFORM_REL = "built_on" as const;
/** Component → enterprise platform. */
export const COMPONENT_PLATFORM_REL = "built_on" as const;

/** @deprecated Legacy rel type before system platforms used built_on. */
export const LEGACY_SYSTEM_PLATFORM_REL = "runs_on" as const;

export const SYSTEM_OBJECT_TYPES = new Set<ObjectType>([
  "application",
  "solution",
  "technical_capability",
]);

export function isSystemObjectType(type: ObjectType | string): boolean {
  return SYSTEM_OBJECT_TYPES.has(type as ObjectType);
}

export function isSystemPlatformRelationship(rel: Relationship, systemId: string): boolean {
  if (rel.from_object_id !== systemId || rel.to_type !== "cloud_service") return false;
  if (!isSystemObjectType(rel.from_type)) return false;
  if (rel.type === SYSTEM_PLATFORM_REL) return true;
  return rel.type === LEGACY_SYSTEM_PLATFORM_REL;
}

export function filterEnterprisePlatforms(items: MinEAObject[]): MinEAObject[] {
  return items.filter((item) =>
    isEnterprisePlatform((item.properties ?? {}) as CloudServiceProperties)
  );
}

export function platformRefFromObject(platform: MinEAObject): PlatformRef {
  return { platform_id: platform.id, platform_name: platform.name };
}

export async function loadSystemPlatformRef(
  orgSlug: string,
  workspaceSlug: string,
  systemId: string,
  token: string
): Promise<PlatformRef | null> {
  const rels = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: systemId },
    token
  );
  const rel = rels.find((r) => isSystemPlatformRelationship(r, systemId));
  if (!rel) return null;
  return { platform_id: rel.to_object_id, platform_name: "" };
}

export async function loadComponentPlatformRef(
  orgSlug: string,
  workspaceSlug: string,
  componentId: string,
  token: string
): Promise<PlatformRef | null> {
  const rels = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: componentId },
    token
  );
  const rel = rels.find(
    (r) =>
      r.type === COMPONENT_PLATFORM_REL &&
      r.from_type === "component" &&
      r.to_type === "cloud_service"
  );
  if (!rel) return null;
  return { platform_id: rel.to_object_id, platform_name: "" };
}

export async function syncSystemPlatformRelation(
  orgSlug: string,
  workspaceSlug: string,
  systemId: string,
  systemType: ObjectType,
  platform: PlatformRef | null,
  token: string
): Promise<void> {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: systemId },
    token
  );

  for (const rel of existing) {
    if (isSystemPlatformRelationship(rel, systemId)) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  if (platform) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: SYSTEM_PLATFORM_REL,
        from_object_id: systemId,
        from_type: systemType,
        to_object_id: platform.platform_id,
        to_type: "cloud_service",
      },
      token
    );
  }
}

export async function syncComponentPlatformRelation(
  orgSlug: string,
  workspaceSlug: string,
  componentId: string,
  platform: PlatformRef | null,
  token: string
): Promise<void> {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: componentId },
    token
  );

  for (const rel of existing) {
    if (
      rel.from_type === "component" &&
      rel.type === COMPONENT_PLATFORM_REL &&
      rel.to_type === "cloud_service"
    ) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  if (platform) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: COMPONENT_PLATFORM_REL,
        from_object_id: componentId,
        from_type: "component",
        to_object_id: platform.platform_id,
        to_type: "cloud_service",
      },
      token
    );
  }
}
