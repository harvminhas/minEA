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

export const INFRA_KINDS = [
  { value: "ipaas", label: "iPaaS", hint: "MuleSoft, Workato, Boomi" },
  { value: "etl_elt", label: "ETL / ELT", hint: "Fivetran, Airbyte, ADF" },
  { value: "broker", label: "Broker", hint: "Kafka, EventBridge" },
  { value: "gateway", label: "Gateway", hint: "Apigee, Kong, APIM" },
  { value: "transport", label: "Transport", hint: "SFTP, VPN, file drop" },
  { value: "custom", label: "Custom", hint: "In-house carrier" },
] as const;

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

export function isIntegrationInfra(props: ToolProperties): boolean {
  return props.integration_infra_kind != null;
}

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
