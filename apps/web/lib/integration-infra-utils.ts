import type { MinEAObject, ObjectStatus, ToolProperties } from "@minea/types";
import {
  lifecycleToStatus,
  PLATFORM_CRITICALITY,
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_LIFECYCLE,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_SLA,
  PLATFORM_SLA_LABEL,
  statusToLifecycle,
  TECHNOLOGY_LAYER_COLOR,
} from "@/lib/platform-utils";

export {
  lifecycleToStatus,
  statusToLifecycle,
  PLATFORM_SLA,
  PLATFORM_SLA_LABEL,
  PLATFORM_LIFECYCLE,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_CRITICALITY,
  PLATFORM_CRITICALITY_LABEL,
  TECHNOLOGY_LAYER_COLOR,
};

export type IntegrationInfraHandle = "apis" | "events" | "flows" | "data";

export const INFRA_KINDS = [
  { value: "gateway", label: "Gateway" },
  { value: "ipaas", label: "iPaaS" },
  { value: "broker", label: "Broker" },
  { value: "etl_elt", label: "ETL / ELT" },
  { value: "transport", label: "Transport" },
  { value: "custom", label: "Custom" },
] as const;

export const INFRA_HANDLES: { value: IntegrationInfraHandle; label: string }[] = [
  { value: "apis", label: "APIs" },
  { value: "events", label: "Events" },
  { value: "flows", label: "Flows" },
  { value: "data", label: "Data" },
];

/** Suggested handles when the user picks a kind (they can toggle after). */
export const DEFAULT_HANDLES_BY_KIND: Record<string, IntegrationInfraHandle[]> = {
  gateway: ["apis"],
  ipaas: ["apis", "events", "flows"],
  broker: ["events"],
  etl_elt: ["data", "flows"],
  transport: ["flows", "data"],
  custom: [],
};

export function defaultHandlesForKind(kind: string): IntegrationInfraHandle[] {
  return DEFAULT_HANDLES_BY_KIND[kind] ?? [];
}

export function formatInfraHandles(handles: IntegrationInfraHandle[] | undefined): string {
  if (!handles?.length) return "";
  const labels = Object.fromEntries(INFRA_HANDLES.map((h) => [h.value, h.label]));
  return handles.map((h) => labels[h] ?? h).join(", ");
}

/** Resolved handles for an infra object (stored handles, or kind defaults). */
export function resolvedInfraHandles(props: ToolProperties): IntegrationInfraHandle[] {
  if (props.integration_infra_handles?.length) return props.integration_infra_handles;
  if (props.integration_infra_kind) return defaultHandlesForKind(props.integration_infra_kind);
  return [];
}

export function infraSupportsHandle(
  props: ToolProperties,
  handle: IntegrationInfraHandle
): boolean {
  return resolvedInfraHandles(props).includes(handle);
}

export function isIntegrationInfra(props: ToolProperties): boolean {
  return props.integration_infra_kind != null;
}

/** API gateway picker: legacy gateway_platform tools or any infra that handles APIs. */
export function isApiGatewayCarrier(props: ToolProperties): boolean {
  if (props.gateway_platform) return true;
  return isIntegrationInfra(props) && infraSupportsHandle(props, "apis");
}

export const INFRA_VENDORS = [
  { value: "salesforce_mulesoft", label: "Salesforce (MuleSoft)" },
  { value: "confluent", label: "Confluent" },
  { value: "google", label: "Google" },
];

export const INFRA_HOSTING = [
  { value: "saas", label: "SaaS" },
  { value: "self_hosted", label: "Self-hosted" },
  { value: "hybrid", label: "Hybrid" },
];

export const INFRA_LICENSE = [
  { value: "per_vcore", label: "Per-vCore / capacity" },
  { value: "per_connector", label: "Per-connector" },
  { value: "per_message_volume", label: "Per-message volume" },
  { value: "flat_enterprise", label: "Flat / enterprise" },
  { value: "open_source", label: "Open source" },
];

export const INFRA_KIND_LABEL = Object.fromEntries(INFRA_KINDS.map((k) => [k.value, k.label]));
export const INFRA_VENDOR_LABEL = Object.fromEntries(INFRA_VENDORS.map((v) => [v.value, v.label]));
export const INFRA_HOSTING_LABEL = Object.fromEntries(INFRA_HOSTING.map((h) => [h.value, h.label]));
export const INFRA_LICENSE_LABEL = Object.fromEntries(INFRA_LICENSE.map((l) => [l.value, l.label]));

export function infraKindLabel(props: ToolProperties): string {
  if (props.integration_infra_kind === "custom" && props.integration_infra_kind_other?.trim()) {
    return props.integration_infra_kind_other.trim();
  }
  return INFRA_KIND_LABEL[props.integration_infra_kind ?? ""] ?? props.integration_infra_kind ?? "";
}

export function infraVendorLabel(vendor: string | undefined): string {
  if (!vendor) return "";
  return INFRA_VENDOR_LABEL[vendor] ?? vendor;
}

export const INFRA_ICON_STYLE = "bg-teal-50 text-teal-700";

export function formatInfraSubtitle(props: ToolProperties): string {
  const kind = infraKindLabel(props);
  return kind ? `Integration infra · ${kind}` : "Integration infra";
}

export function collectCustomVendors(items: MinEAObject[]): string[] {
  const presetIds = new Set(INFRA_VENDORS.map((v) => v.value));
  const names = items
    .map((item) => (item.properties as ToolProperties).vendor)
    .filter((v): v is string => !!v && !presetIds.has(v));
  return [...new Set(names)];
}

export function buildIntegrationInfraProperties(params: {
  kind: string;
  kindOther: string;
  handles: IntegrationInfraHandle[];
  vendor: string;
  vendorProduct: string;
  hostingModel: string;
  region: string;
  environments: string[];
  adminUrl: string;
  licenseModel: string;
  contractRenewal: string;
  annualCost: string;
  slaTarget: string;
  lifecycle: string;
  criticality: string;
}): ToolProperties {
  return {
    integration_infra_kind: params.kind as ToolProperties["integration_infra_kind"],
    integration_infra_kind_other:
      params.kind === "custom" ? params.kindOther.trim() || undefined : undefined,
    integration_infra_handles: params.handles.length > 0 ? params.handles : undefined,
    vendor: params.vendor || undefined,
    vendor_product: params.vendorProduct.trim() || undefined,
    hosting_model: params.hostingModel as ToolProperties["hosting_model"],
    region: params.region.trim() || undefined,
    environments: params.environments.length > 0 ? params.environments : undefined,
    admin_url: params.adminUrl.trim() || undefined,
    license_model: params.licenseModel as ToolProperties["license_model"],
    contract_renewal: params.contractRenewal.trim() || undefined,
    annual_cost: params.annualCost.trim() || undefined,
    sla_target: params.slaTarget as ToolProperties["sla_target"],
    lifecycle: params.lifecycle as ToolProperties["lifecycle"],
    criticality: params.criticality as ToolProperties["criticality"],
  };
}
