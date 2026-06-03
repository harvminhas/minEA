import type { CloudServiceProperties, MinEAObject, PlatformRef } from "@minea/types";
import { relationshipsApi } from "@/lib/api-client";
import { isEnterprisePlatform } from "@/lib/platform-utils";

export const SYSTEM_PLATFORM_REL = "runs_on" as const;
export const COMPONENT_PLATFORM_REL = "built_on" as const;

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
  const rel = rels.find(
    (r) =>
      r.type === SYSTEM_PLATFORM_REL &&
      r.from_type === "application" &&
      r.to_type === "cloud_service"
  );
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
    if (
      rel.from_type === "application" &&
      rel.type === SYSTEM_PLATFORM_REL &&
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
        type: SYSTEM_PLATFORM_REL,
        from_object_id: systemId,
        from_type: "application",
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
