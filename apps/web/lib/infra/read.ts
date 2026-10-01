import type { MinEAObject } from "@minea/types";
import {
  infraConfig,
  isManagedKind,
  locationLabel,
  mapComputeKind,
  platformKindLabel,
  runtimeKindLabel,
} from "@/lib/infra/infraConfig";
import { RUNTIME_PROVIDER_LABEL } from "@/lib/runtime-utils";
import { PLATFORM_VENDOR_LABEL } from "@/lib/platform-utils";

export type RuntimeInfra = {
  id: string;
  name: string;
  runtimeKind: string | null;
  kindLabel: string;
  managed: boolean;
  locationLabel: string;
  locationDetail: string;
  osName: string;
  osVersion: string;
  supportEnds: string | null;
  endOfLife: string | null;
  supplier: string;
  provider: string;
};

export type PlatformInfra = {
  id: string;
  name: string;
  platformKind: string | null;
  kindLabel: string;
  kindInferred: boolean;
  hostingLabel: string;
  vendor: string;
  vendorCode: string;
  product: string;
};

function str(props: Record<string, unknown>, key: string): string {
  const value = props[key];
  return typeof value === "string" ? value.trim() : "";
}

export function readRuntimeInfra(object: Pick<MinEAObject, "id" | "name" | "properties">): RuntimeInfra {
  const props = (object.properties ?? {}) as Record<string, unknown>;
  const explicit = str(props, "runtime_kind");
  const runtimeKind = explicit || mapComputeKind(str(props, "compute_runtime_kind"));
  const providerRaw = str(props, "runtime_provider");
  return {
    id: object.id,
    name: object.name,
    runtimeKind: runtimeKind || null,
    kindLabel: runtimeKindLabel(runtimeKind),
    managed: isManagedKind(runtimeKind),
    locationLabel: locationLabel(str(props, "location")),
    locationDetail: str(props, "location_detail") || str(props, "region"),
    osName: str(props, "os_name"),
    osVersion: str(props, "os_version"),
    supportEnds: str(props, "support_ends") || null,
    endOfLife: str(props, "end_of_life") || null,
    supplier: str(props, "vendor"),
    provider: RUNTIME_PROVIDER_LABEL[providerRaw] ?? providerRaw,
  };
}

export function readPlatformInfra(object: Pick<MinEAObject, "id" | "name" | "properties">): PlatformInfra {
  const props = (object.properties ?? {}) as Record<string, unknown>;
  const explicit = str(props, "platform_kind");
  const hosting = str(props, "hosting_model");
  const inferred = explicit ? "" : infraConfig.platformKindFromHosting[hosting] ?? "";
  const platformKind = explicit || inferred || null;
  const code = str(props, "vendor");
  return {
    id: object.id,
    name: object.name,
    platformKind,
    kindLabel: platformKindLabel(platformKind),
    kindInferred: !explicit && Boolean(inferred),
    hostingLabel: infraConfig.platformHostingLabels[hosting] ?? hosting.replace(/_/g, " "),
    vendor: PLATFORM_VENDOR_LABEL[code] ?? code,
    vendorCode: code,
    product: str(props, "vendor_product"),
  };
}

export function noHostLinked(
  object: { type: string; properties?: Record<string, unknown> | null },
  edges: { type: string; fromId: string; toId: string }[],
  objectId: string,
): boolean {
  const props = object.properties ?? {};
  const hosting = typeof props.hosting_model === "string" ? props.hosting_model : "";
  if (!infraConfig.noHostLinked.types.includes(object.type as "application")) return false;
  if (!infraConfig.noHostLinked.hostingModels.includes(hosting as "on_premise")) return false;
  return !edges.some(
    (edge) => edge.fromId === objectId && (infraConfig.noHostLinked.edgeKinds as readonly string[]).includes(edge.type),
  );
}

/** Distinct objects with a runs_on or built_on edge pointing at this host. */
export function hostSourceIds(hostId: string, edges: { type: string; fromId: string; toId: string }[]): string[] {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.toId === hostId && (infraConfig.hostEdgeKinds as readonly string[]).includes(edge.type)) ids.add(edge.fromId);
  }
  return [...ids];
}
