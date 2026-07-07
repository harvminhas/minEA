import { apiProps } from "@/lib/api-list-utils";
import { eventProducerName, eventProps } from "@/lib/event-list-utils";
import { flowProps } from "@/lib/flow-list-utils";
import {
  flowFromLine,
  flowManualOwnerCaption,
  flowMechanismLabel,
  flowToLine,
} from "@/lib/flow-utils";
import type { FlowMechanism, MinEAObject } from "@minea/types";

export type IntegrationKind = "flow" | "api" | "event";

export type IntegrationHealthSeverity = "high" | "medium" | "neutral";

export type HealthFilter = "all" | "manual_no_code" | "public_no_consumers" | "no_owner";

export type IntegrationTypeFilter = "all" | IntegrationKind;

export type IntegrationMechanismFilter =
  | "all"
  | FlowMechanism
  | "public_exposed"
  | "event";

const FLOW_MECHANISM_BADGE: Record<FlowMechanism, string> = {
  api_realtime: "SYNCHRONOUS / REQUEST-RESPONSE",
  event_driven: "EVENT-DRIVEN",
  batch_scheduled: "BATCH",
  no_code_ipaas: "NO-CODE / IPAAS",
  manual: "MANUAL",
  file_based: "FILE-BASED",
};

export interface IntegrationHealthRow {
  id: string;
  kind: IntegrationKind;
  name: string;
  object: MinEAObject;
  typeLabel: string;
  badgeLabel: string;
  detailLine: string;
  mechanism: string;
  owner: string;
  severity: IntegrationHealthSeverity;
  isManualOrNoCode: boolean;
  isPublicNoConsumers: boolean;
  isNoOwner: boolean;
}

export interface IntegrationHealthSummary {
  apiCount: number;
  eventCount: number;
  flowCount: number;
  totalCount: number;
  manualNoCodeCount: number;
  publicNoConsumersCount: number;
  noOwnerCount: number;
}

function flowOwner(object: MinEAObject): string {
  return flowManualOwnerCaption(object) || object.owner?.trim() || "";
}

function isPublicApiNoConsumers(object: MinEAObject): boolean {
  const props = apiProps(object);
  const audience = props.audience ?? "internal";
  if (audience !== "public" && audience !== "partner") return false;
  return (props.consumers?.length ?? 0) === 0;
}

function buildFlowRow(object: MinEAObject): IntegrationHealthRow {
  const props = flowProps(object);
  const mechanism = props.mechanism;
  const owner = flowOwner(object);
  const route = `${flowFromLine(props)} → ${flowToLine(props)}`;
  const detailLine = owner ? `${route} · ${owner}` : route;

  let badgeLabel = mechanism
    ? FLOW_MECHANISM_BADGE[mechanism] ?? flowMechanismLabel(props).toUpperCase()
    : "FLOW";
  let severity: IntegrationHealthSeverity = "neutral";
  let isManualOrNoCode = false;
  let isNoOwner = false;

  if (mechanism === "manual" || mechanism === "no_code_ipaas") {
    isManualOrNoCode = true;
    severity = "high";
    if (mechanism === "no_code_ipaas" && props.platform?.trim()) {
      badgeLabel = "NO-CODE / IPAAS";
    }
  } else if (mechanism === "batch_scheduled" && !owner) {
    isNoOwner = true;
    severity = "medium";
    badgeLabel = "BATCH · NO OWNER";
  }

  return {
    id: object.id,
    kind: "flow",
    name: object.name,
    object,
    typeLabel: "FLOW",
    badgeLabel,
    detailLine,
    mechanism: mechanism ?? "",
    owner,
    severity,
    isManualOrNoCode,
    isPublicNoConsumers: false,
    isNoOwner,
  };
}

function buildApiRow(object: MinEAObject): IntegrationHealthRow {
  const props = apiProps(object);
  const provider = props.provider?.provider_name?.trim();
  const audience = props.audience;
  const parts: string[] = [];
  if (provider) parts.push(`Provider: ${provider}`);
  if (audience) parts.push(audience);
  const isPublicNoConsumers = isPublicApiNoConsumers(object);

  let badgeLabel = props.protocol?.toUpperCase() ?? "API";
  let severity: IntegrationHealthSeverity = "neutral";
  if (isPublicNoConsumers) {
    badgeLabel = "NO CONSUMERS LISTED";
    severity = "medium";
  }

  return {
    id: object.id,
    kind: "api",
    name: object.name,
    object,
    typeLabel: "API",
    badgeLabel,
    detailLine: parts.join(" · ") || "—",
    mechanism: props.protocol ?? "api",
    owner: object.owner?.trim() ?? "",
    severity,
    isManualOrNoCode: false,
    isPublicNoConsumers,
    isNoOwner: false,
  };
}

function buildEventRow(object: MinEAObject): IntegrationHealthRow {
  const props = eventProps(object);
  const producer = eventProducerName(object);
  const subscribers = props.subscribers?.map((s) => s.subscriber_name.trim()).filter(Boolean);
  const parts: string[] = [];
  if (producer) parts.push(`Producer: ${producer}`);
  if (subscribers?.length) parts.push(`Subscribers: ${subscribers.join(", ")}`);

  return {
    id: object.id,
    kind: "event",
    name: object.name,
    object,
    typeLabel: "EVENT",
    badgeLabel: "EVENT",
    detailLine: parts.join(" · ") || "—",
    mechanism: "event",
    owner: object.owner?.trim() ?? "",
    severity: "neutral",
    isManualOrNoCode: false,
    isPublicNoConsumers: false,
    isNoOwner: false,
  };
}

export function buildIntegrationHealthRows(
  flows: MinEAObject[],
  apis: MinEAObject[],
  events: MinEAObject[]
): IntegrationHealthRow[] {
  const rows = [
    ...flows.map(buildFlowRow),
    ...apis.map(buildApiRow),
    ...events.map(buildEventRow),
  ];

  const severityRank: Record<IntegrationHealthSeverity, number> = {
    high: 0,
    medium: 1,
    neutral: 2,
  };

  return rows.sort((a, b) => {
    const sev = severityRank[a.severity] - severityRank[b.severity];
    if (sev !== 0) return sev;
    return a.name.localeCompare(b.name);
  });
}

export function summarizeIntegrationHealth(rows: IntegrationHealthRow[]): IntegrationHealthSummary {
  const apiCount = rows.filter((r) => r.kind === "api").length;
  const eventCount = rows.filter((r) => r.kind === "event").length;
  const flowCount = rows.filter((r) => r.kind === "flow").length;
  return {
    apiCount,
    eventCount,
    flowCount,
    totalCount: rows.length,
    manualNoCodeCount: rows.filter((r) => r.isManualOrNoCode).length,
    publicNoConsumersCount: rows.filter((r) => r.isPublicNoConsumers).length,
    noOwnerCount: rows.filter((r) => r.isNoOwner).length,
  };
}

export function filterIntegrationHealthRows(
  rows: IntegrationHealthRow[],
  opts: {
    type: IntegrationTypeFilter;
    mechanism: IntegrationMechanismFilter;
    owner: string;
    health: HealthFilter;
    search: string;
  }
): IntegrationHealthRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (q) {
      const haystack = [
        row.name,
        row.detailLine,
        row.badgeLabel,
        row.typeLabel,
        row.owner,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (opts.type !== "all" && row.kind !== opts.type) return false;
    if (opts.owner !== "all" && row.owner !== opts.owner) return false;
    if (opts.health === "manual_no_code" && !row.isManualOrNoCode) return false;
    if (opts.health === "public_no_consumers" && !row.isPublicNoConsumers) return false;
    if (opts.health === "no_owner" && !row.isNoOwner) return false;
    if (opts.mechanism !== "all") {
      if (opts.mechanism === "public_exposed") {
        if (!row.isPublicNoConsumers) return false;
      } else if (row.kind === "flow") {
        if (row.mechanism !== opts.mechanism) return false;
      } else if (row.kind === "api" && opts.mechanism !== row.mechanism) {
        return false;
      } else if (row.kind === "event" && opts.mechanism !== "event") {
        return false;
      }
    }
    return true;
  });
}

export function integrationHealthOwnerOptions(rows: IntegrationHealthRow[]): string[] {
  const owners = new Set<string>();
  for (const row of rows) {
    if (row.owner) owners.add(row.owner);
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

export function integrationHealthMechanismOptions(): Array<{ value: IntegrationMechanismFilter; label: string }> {
  return [
    { value: "all", label: "All mechanisms" },
    { value: "manual", label: "Manual" },
    { value: "no_code_ipaas", label: "No-code / iPaaS" },
    { value: "api_realtime", label: "API (real-time)" },
    { value: "event_driven", label: "Event-driven" },
    { value: "batch_scheduled", label: "Batch / scheduled" },
    { value: "file_based", label: "File-based" },
    { value: "event", label: "Events" },
    { value: "public_exposed", label: "Public · no consumers" },
  ];
}

export function integrationHealthTypeOptions(): Array<{ value: IntegrationTypeFilter; label: string }> {
  return [
    { value: "all", label: "All types" },
    { value: "flow", label: "Flows" },
    { value: "api", label: "APIs" },
    { value: "event", label: "Events" },
  ];
}

export const INTEGRATION_HEALTH_SEVERITY_STYLE: Record<
  IntegrationHealthSeverity,
  { border: string; badge: string; badgeText: string }
> = {
  high: {
    border: "border-t-red-500",
    badge: "bg-red-50 border-red-200 text-red-700",
    badgeText: "text-red-700",
  },
  medium: {
    border: "border-t-amber-500",
    badge: "bg-amber-50 border-amber-200 text-amber-800",
    badgeText: "text-amber-800",
  },
  neutral: {
    border: "border-t-gray-300",
    badge: "bg-gray-50 border-gray-200 text-gray-600",
    badgeText: "text-gray-600",
  },
};
