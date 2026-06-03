import type {
  ApiConsumerRef,
  ApiGatewayRef,
  ApiProperties,
  ApiProviderRef,
  MinEAObject,
  ObjectStatus,
} from "@minea/types";

export const INTEGRATION_LAYER_COLOR = "#14b8a6";

export const API_STYLES = [
  { value: "rest", label: "REST" },
  { value: "graphql", label: "GraphQL" },
  { value: "grpc", label: "gRPC" },
  { value: "soap", label: "SOAP" },
];

export const API_AUTH = [
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "api_key", label: "API key" },
  { value: "basic", label: "Basic auth" },
  { value: "mutual_tls", label: "Mutual TLS" },
  { value: "none", label: "None" },
];

export const API_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "retiring", label: "Retiring" },
  { value: "retired", label: "Retired" },
];

export const API_AUDIENCES = [
  { value: "internal", label: "Internal" },
  { value: "partner", label: "Partner" },
  { value: "public", label: "Public" },
];

export const API_CRITICALITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const PRESET_CONSUMERS = [
  "Web app",
  "Mobile app",
  "Partner integrations",
];

export const API_GATEWAY_PRESETS = [
  { value: "apigee", label: "Apigee (prod)" },
  { value: "kong", label: "Kong" },
  { value: "aws_api_gateway", label: "AWS API Gateway" },
] as const;

export const API_GATEWAY_PLATFORM_LABEL = Object.fromEntries(
  API_GATEWAY_PRESETS.map((g) => [g.value, g.label])
);

export function gatewayKeyFromRef(gateway: ApiGatewayRef | null | undefined): string {
  if (!gateway) return "";
  if (gateway.gateway_id) return `registered:${gateway.gateway_id}`;
  if (gateway.platform) return `preset:${gateway.platform}`;
  return "";
}

export function gatewayRefFromKey(
  key: string,
  registeredGateways: Array<{ id: string; name: string; platform?: string }>
): ApiGatewayRef | null {
  if (!key) return null;
  if (key === "__register__") return null;
  if (key.startsWith("preset:")) {
    const platform = key.slice(7) as ApiGatewayRef["platform"];
    const label = API_GATEWAY_PLATFORM_LABEL[platform ?? ""] ?? platform;
    return { gateway_name: label ?? key, platform };
  }
  if (key.startsWith("registered:")) {
    const id = key.slice(11);
    const gateway = registeredGateways.find((g) => g.id === id);
    if (!gateway) return null;
    return {
      gateway_id: gateway.id,
      gateway_name: gateway.name,
      platform: gateway.platform as ApiGatewayRef["platform"],
    };
  }
  return null;
}

export const API_STYLE_LABEL = Object.fromEntries(API_STYLES.map((s) => [s.value, s.label]));
export const API_AUTH_LABEL = Object.fromEntries(API_AUTH.map((a) => [a.value, a.label]));

export const API_STATUS_STYLE: Record<string, string> = {
  planned: "bg-sky-50 text-sky-700",
  active: "bg-emerald-50 text-emerald-700",
  retiring: "bg-amber-50 text-amber-700",
  retired: "bg-red-50 text-red-500",
};

export const API_CRITICALITY_STYLE: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-emerald-50 text-emerald-700",
};

export const API_CRITICALITY_LABEL = Object.fromEntries(
  API_CRITICALITY.map((c) => [c.value, c.label])
);

export function formatApiSubtitle(protocol?: string): string {
  const style = protocol ? (API_STYLE_LABEL[protocol] ?? protocol) : null;
  return style ? `API · ${style}` : "API";
}

export function formatConsumersLine(consumers: ApiConsumerRef[]): string {
  const count = consumers.length;
  if (count === 0) return "0";
  return `${count} · ${consumers[0]!.consumer_name}`;
}

export function formatProviderLabel(provider: ApiProviderRef): string {
  if (provider.provider_kind === "component" && provider.system_name) {
    return `${provider.provider_name} (${provider.system_name})`;
  }
  return provider.provider_name;
}

export function buildApiDraft(params: {
  name: string;
  protocol: string;
  version: string;
  auth: string;
  provider: ApiProviderRef | null;
  consumers: ApiConsumerRef[];
  gateway: ApiGatewayRef | null;
  audience: string;
  criticality: string;
  status: ObjectStatus;
  owner?: string;
  tags?: string[];
  nodeLayout?: Record<string, { x: number; y: number }>;
}): MinEAObject {
  const properties: ApiProperties = {
    protocol: params.protocol as ApiProperties["protocol"],
    version: params.version.trim() || undefined,
    auth: params.auth,
    provider: params.provider,
    consumers: params.consumers,
    gateway: params.gateway,
    audience: params.audience as ApiProperties["audience"],
    criticality: params.criticality as ApiProperties["criticality"],
    node_layout: params.nodeLayout,
  };

  return {
    id: "draft",
    workspace_id: "",
    org_id: "",
    type: "api",
    name: params.name.trim() || "New API",
    description: undefined,
    owner: params.owner,
    status: params.status,
    tags: params.tags ?? [],
    properties: properties as Record<string, unknown>,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
