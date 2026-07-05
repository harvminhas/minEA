import { persistApiArchitecture } from "@/lib/api-relationship-utils";
import { persistEventArchitecture } from "@/lib/event-relationship-utils";
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
