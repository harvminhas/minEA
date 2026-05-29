import type { MinEAObject, ModelProperties } from "@minea/types";
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

export const RUNTIME_KINDS = [
  { value: "kubernetes", label: "Kubernetes", hint: "EKS, GKE, AKS, on-prem" },
  { value: "serverless", label: "Serverless", hint: "Lambda, Cloud Functions" },
  { value: "container", label: "Container", hint: "ECS, Cloud Run, ACA" },
  { value: "vm", label: "VM", hint: "EC2, GCE, on-prem VMs" },
  { value: "paas", label: "PaaS / app host", hint: "App Service, Heroku" },
  { value: "on_prem", label: "On-prem", hint: "bare metal, data centre" },
] as const;

export const RUNTIME_PROVIDERS = [
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
  { value: "azure", label: "Azure" },
  { value: "on_premise", label: "On-premise" },
];

export const RUNTIME_HOSTING = [
  { value: "public_cloud", label: "Public cloud" },
  { value: "private_cloud", label: "Private cloud" },
  { value: "on_premise", label: "On-premise" },
  { value: "hybrid", label: "Hybrid" },
];

export const RUNTIME_COST_MODEL = [
  { value: "per_vcpu_memory", label: "Per-vCPU / memory" },
  { value: "per_instance_hour", label: "Per-instance-hour" },
  { value: "per_invocation", label: "Per-invocation" },
  { value: "reserved_committed", label: "Reserved / committed" },
  { value: "flat_enterprise", label: "Flat / enterprise" },
  { value: "capex", label: "CapEx (owned hardware)" },
];

export const RUNTIME_KIND_LABEL = Object.fromEntries(RUNTIME_KINDS.map((k) => [k.value, k.label]));
export const RUNTIME_PROVIDER_LABEL = Object.fromEntries(RUNTIME_PROVIDERS.map((p) => [p.value, p.label]));
export const RUNTIME_HOSTING_LABEL = Object.fromEntries(RUNTIME_HOSTING.map((h) => [h.value, h.label]));
export const RUNTIME_COST_MODEL_LABEL = Object.fromEntries(RUNTIME_COST_MODEL.map((c) => [c.value, c.label]));

export function isComputeRuntime(props: ModelProperties): boolean {
  return props.compute_runtime_kind != null;
}

export function isAiModel(props: ModelProperties): boolean {
  return props.compute_runtime_kind == null;
}

export function runtimeKindLabel(props: ModelProperties): string {
  return RUNTIME_KIND_LABEL[props.compute_runtime_kind ?? ""] ?? props.compute_runtime_kind ?? "";
}

export function runtimeProviderLabel(provider: string | undefined): string {
  if (!provider) return "";
  return RUNTIME_PROVIDER_LABEL[provider] ?? provider;
}

export function collectCustomProviders(items: MinEAObject[]): string[] {
  const presetIds = new Set(RUNTIME_PROVIDERS.map((p) => p.value));
  const names = items
    .map((item) => (item.properties as ModelProperties).runtime_provider)
    .filter((p): p is string => !!p && !presetIds.has(p));
  return [...new Set(names)];
}

export function buildRuntimeProperties(params: {
  kind: string;
  provider: string;
  serviceProduct: string;
  hostingModel: string;
  region: string;
  environments: string[];
  consoleUrl: string;
  costModel: string;
  commitmentEnds: string;
  annualCost: string;
  slaTarget: string;
  lifecycle: string;
  criticality: string;
}): ModelProperties {
  return {
    compute_runtime_kind: params.kind as ModelProperties["compute_runtime_kind"],
    runtime_provider: params.provider || undefined,
    service_product: params.serviceProduct.trim() || undefined,
    hosting_model: params.hostingModel as ModelProperties["hosting_model"],
    region: params.region.trim() || undefined,
    environments: params.environments.length > 0 ? params.environments : undefined,
    console_url: params.consoleUrl.trim() || undefined,
    cost_model: params.costModel as ModelProperties["cost_model"],
    commitment_ends: params.commitmentEnds.trim() || undefined,
    annual_cost: params.annualCost.trim() || undefined,
    sla_target: params.slaTarget as ModelProperties["sla_target"],
    lifecycle: params.lifecycle as ModelProperties["lifecycle"],
    criticality: params.criticality as ModelProperties["criticality"],
  };
}
