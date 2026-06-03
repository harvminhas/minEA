import type { CloudServiceProperties, MinEAObject, ObjectStatus } from "@minea/types";

export const TECHNOLOGY_LAYER_COLOR = "#64748b";

export const PLATFORM_VENDORS = [
  { value: "microsoft", label: "Microsoft" },
  { value: "salesforce", label: "Salesforce" },
  { value: "servicenow", label: "ServiceNow" },
  { value: "sap", label: "SAP" },
  { value: "oracle", label: "Oracle" },
  { value: "google", label: "Google" },
  { value: "amazon", label: "Amazon" },
  { value: "other", label: "Other" },
];

export const PLATFORM_TYPES = [
  { value: "low_code", label: "Low-code / no-code" },
  { value: "itsm", label: "ITSM foundation" },
  { value: "crm", label: "CRM foundation" },
  { value: "erp", label: "ERP foundation" },
  { value: "bpm", label: "BPM / workflow" },
  { value: "custom_dev", label: "Custom development" },
  { value: "other", label: "Other…" },
];

export const PLATFORM_HOSTING = [
  { value: "saas", label: "SaaS" },
  { value: "paas", label: "PaaS" },
  { value: "self_hosted", label: "Self-hosted" },
  { value: "hybrid", label: "Hybrid" },
];

export const PLATFORM_LICENSE = [
  { value: "per_user", label: "Per-user" },
  { value: "per_capacity", label: "Per-capacity" },
  { value: "per_api_call", label: "Per-API-call" },
  { value: "flat_enterprise", label: "Flat / enterprise" },
  { value: "open_source", label: "Open source" },
];

export const PLATFORM_SLA = [
  { value: "99_9", label: "99.9%" },
  { value: "99_95", label: "99.95%" },
  { value: "99_99", label: "99.99%" },
  { value: "best_effort", label: "Best effort" },
];

export const PLATFORM_LIFECYCLE = [
  { value: "pilot", label: "Pilot" },
  { value: "active", label: "Active" },
  { value: "deprecated", label: "Deprecated" },
  { value: "end_of_life", label: "End of life" },
];

export const PLATFORM_CRITICALITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "tier1", label: "Tier 1 / business-critical" },
];

export const PLATFORM_VENDOR_LABEL = Object.fromEntries(PLATFORM_VENDORS.map((v) => [v.value, v.label]));
export const PLATFORM_TYPE_LABEL = Object.fromEntries(PLATFORM_TYPES.map((t) => [t.value, t.label]));
export const PLATFORM_HOSTING_LABEL = Object.fromEntries(PLATFORM_HOSTING.map((h) => [h.value, h.label]));
export const PLATFORM_LICENSE_LABEL = Object.fromEntries(PLATFORM_LICENSE.map((l) => [l.value, l.label]));
export const PLATFORM_SLA_LABEL = Object.fromEntries(PLATFORM_SLA.map((s) => [s.value, s.label]));
export const PLATFORM_LIFECYCLE_LABEL = Object.fromEntries(PLATFORM_LIFECYCLE.map((l) => [l.value, l.label]));
export const PLATFORM_CRITICALITY_LABEL = Object.fromEntries(PLATFORM_CRITICALITY.map((c) => [c.value, c.label]));

export function isEnterprisePlatform(props: CloudServiceProperties): boolean {
  return props.platform_type != null;
}

export const PLATFORM_ICON_STYLE = "bg-indigo-50 text-indigo-700";

export function formatPlatformSubtitle(props: CloudServiceProperties): string {
  const typeLabel = platformTypeLabel(props);
  return typeLabel ? `Platform · ${typeLabel}` : "Platform";
}

export function platformTypeLabel(props: CloudServiceProperties): string {
  if (props.platform_type === "other" && props.platform_type_other?.trim()) {
    return props.platform_type_other.trim();
  }
  return PLATFORM_TYPE_LABEL[props.platform_type ?? ""] ?? props.platform_type ?? "";
}

export function lifecycleToStatus(lifecycle: string): ObjectStatus {
  switch (lifecycle) {
    case "pilot":
      return "under_evaluation";
    case "active":
      return "active";
    case "deprecated":
      return "deprecated";
    case "end_of_life":
      return "retired";
    default:
      return "planned";
  }
}

export function statusToLifecycle(status: ObjectStatus | string | null | undefined): string {
  switch (status) {
    case "under_evaluation":
      return "pilot";
    case "active":
      return "active";
    case "deprecated":
      return "deprecated";
    case "retired":
      return "end_of_life";
    default:
      return "pilot";
  }
}

export function buildPlatformProperties(params: {
  vendor: string;
  vendorProduct: string;
  platformType: string;
  platformTypeOther: string;
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
}): CloudServiceProperties {
  return {
    vendor: params.vendor || undefined,
    vendor_product: params.vendorProduct.trim() || undefined,
    platform_type: params.platformType as CloudServiceProperties["platform_type"],
    platform_type_other:
      params.platformType === "other" ? params.platformTypeOther.trim() || undefined : undefined,
    hosting_model: params.hostingModel as CloudServiceProperties["hosting_model"],
    region: params.region.trim() || undefined,
    environments: params.environments.length > 0 ? params.environments : undefined,
    admin_url: params.adminUrl.trim() || undefined,
    license_model: params.licenseModel as CloudServiceProperties["license_model"],
    contract_renewal: params.contractRenewal.trim() || undefined,
    annual_cost: params.annualCost.trim() || undefined,
    sla_target: params.slaTarget as CloudServiceProperties["sla_target"],
    lifecycle: params.lifecycle as CloudServiceProperties["lifecycle"],
    criticality: params.criticality as CloudServiceProperties["criticality"],
  };
}

export function buildPlatformDraft(params: {
  name: string;
  description?: string;
  owner?: string;
  tags?: string[];
  properties: CloudServiceProperties;
  lifecycle: string;
}): MinEAObject {
  return {
    id: "draft",
    workspace_id: "",
    org_id: "",
    type: "cloud_service",
    name: params.name.trim() || "New platform",
    description: params.description,
    owner: params.owner,
    status: lifecycleToStatus(params.lifecycle),
    tags: params.tags ?? [],
    properties: params.properties as Record<string, unknown>,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
