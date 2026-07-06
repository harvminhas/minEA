import { relationshipsApi } from "@/lib/api-client";
import { persistApiArchitecture } from "@/lib/api-relationship-utils";
import { persistEventArchitecture } from "@/lib/event-relationship-utils";
import { SYSTEM_PLATFORM_REL } from "@/lib/platform-relationship-utils";
import type { ApiProviderRef, EventProducerRef, MinEAObject } from "@minea/types";

export function systemApiProviderRef(system: MinEAObject): ApiProviderRef {
  return {
    provider_id: system.id,
    provider_name: system.name,
    provider_kind: "application",
  };
}

export function systemEventProducerRef(system: MinEAObject): EventProducerRef {
  return {
    producer_id: system.id,
    producer_name: system.name,
    producer_kind: "application",
  };
}

export async function linkApiToSystemAsProvider(
  orgSlug: string,
  workspaceSlug: string,
  system: MinEAObject,
  api: MinEAObject,
  token: string
): Promise<MinEAObject> {
  return persistApiArchitecture(orgSlug, workspaceSlug, api, {
    provider: systemApiProviderRef(system),
  }, token);
}

export async function linkEventToSystemAsProducer(
  orgSlug: string,
  workspaceSlug: string,
  system: MinEAObject,
  event: MinEAObject,
  token: string
): Promise<MinEAObject> {
  return persistEventArchitecture(orgSlug, workspaceSlug, event, {
    producer: systemEventProducerRef(system),
  }, token);
}

export async function linkPlatformToSystem(
  orgSlug: string,
  workspaceSlug: string,
  system: MinEAObject,
  platform: MinEAObject,
  token: string
): Promise<void> {
  await relationshipsApi.create(
    orgSlug,
    workspaceSlug,
    {
      type: SYSTEM_PLATFORM_REL,
      from_object_id: system.id,
      from_type: system.type,
      to_object_id: platform.id,
      to_type: "cloud_service",
    },
    token
  );
}

export async function linkRuntimeToSystem(
  orgSlug: string,
  workspaceSlug: string,
  system: MinEAObject,
  runtime: MinEAObject,
  token: string
): Promise<void> {
  await relationshipsApi.create(
    orgSlug,
    workspaceSlug,
    {
      type: "runs_on",
      from_object_id: system.id,
      from_type: system.type,
      to_object_id: runtime.id,
      to_type: "model",
    },
    token
  );
}
