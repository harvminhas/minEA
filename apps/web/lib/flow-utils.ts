import type {
  FlowEndpointCatalog,
  FlowEndpointEntity,
  FlowEndpointSide,
  FlowEntitySelection,
  FlowSystemSelection,
  IntegrationFlowProperties,
} from "@minea/types";

export const INTEGRATION_LAYER_COLOR = "#14b8a6";

export const FLOW_PROTOCOLS = [
  { value: "rest_api", label: "REST API" },
  { value: "graphql", label: "GraphQL" },
  { value: "grpc", label: "gRPC" },
  { value: "jdbc", label: "JDBC" },
  { value: "file", label: "File transfer" },
];

export const FLOW_FORMATS = [
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "csv", label: "CSV" },
  { value: "avro", label: "Avro" },
  { value: "parquet", label: "Parquet" },
];

export const FLOW_FREQUENCIES = [
  { value: "realtime", label: "Real-time" },
  { value: "batch", label: "Batch" },
  { value: "scheduled", label: "Scheduled" },
  { value: "event_driven", label: "Event-driven" },
];

export const FLOW_AUTH = [
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "api_key", label: "API key" },
  { value: "basic", label: "Basic auth" },
  { value: "mutual_tls", label: "Mutual TLS" },
  { value: "none", label: "None" },
];

export const FLOW_DIRECTIONS = [
  { value: "one_way", label: "One-way" },
  { value: "bidirectional", label: "Bidirectional" },
];

export const FLOW_STATUSES = [
  { value: "planned", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "retiring", label: "Retiring" },
];

export const FLOW_CRITICALITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const FLOW_PROTOCOL_LABEL = Object.fromEntries(FLOW_PROTOCOLS.map((p) => [p.value, p.label]));
export const FLOW_AUTH_LABEL = Object.fromEntries(FLOW_AUTH.map((a) => [a.value, a.label]));
export const FLOW_CRITICALITY_LABEL = Object.fromEntries(FLOW_CRITICALITY.map((c) => [c.value, c.label]));

export function formatFlowSubtitle(protocol?: string): string {
  const label = protocol ? (FLOW_PROTOCOL_LABEL[protocol] ?? protocol) : null;
  return label ? `Flow · ${label}` : "Flow";
}

export function formatEndpointSideLine(
  systems: FlowSystemSelection[],
  entities: FlowEntitySelection[]
): string {
  const count = systems.length + entities.length;
  if (count === 0) return "—";
  const first = systems[0]?.system_name ?? entities[0]?.entity_name;
  if (!first) return String(count);
  return `${count} · ${first}`;
}

export function flowSourceLine(props: IntegrationFlowProperties): string {
  return formatEndpointSideLine(
    props.sources?.systems ?? [],
    props.sources?.entities ?? []
  );
}

export function flowDestinationLine(props: IntegrationFlowProperties): string {
  return formatEndpointSideLine(
    props.destinations?.systems ?? [],
    props.destinations?.entities ?? []
  );
}

export const CLASSIFICATION_LEVELS = [
  "public",
  "internal",
  "confidential",
  "core",
  "reference",
  "pii",
  "restricted",
] as const;

const CLASSIFICATION_RANK: Record<string, number> = {
  public: 0,
  internal: 1,
  core: 2,
  reference: 2,
  confidential: 3,
  pii: 4,
  restricted: 5,
};

export function emptyEndpointSide(): FlowEndpointSide {
  return { systems: [], entities: [] };
}

export function entityHasPii(entity: FlowEndpointEntity): boolean {
  return entity.sensitivity === "pii" || entity.classification === "pii";
}

export function entityClassification(entity: FlowEndpointEntity): string | null {
  if (entity.sensitivity === "pii") return "pii";
  return entity.classification ?? null;
}

export function isEntityCoveredByWildcard(
  entity: FlowEndpointEntity,
  systems: FlowSystemSelection[]
): boolean {
  if (!entity.system_id) return false;
  return systems.some((s) => s.system_id === entity.system_id);
}

export function resolveSideEntities(
  side: FlowEndpointSide,
  catalog: FlowEndpointCatalog
): FlowEndpointEntity[] {
  const explicitIds = new Set(side.entities.map((e) => e.entity_id));
  const fromWildcards = catalog.entities.filter(
    (e) => e.system_id && side.systems.some((s) => s.system_id === e.system_id) && !explicitIds.has(e.id)
  );
  const explicit = side.entities
    .map((sel) => catalog.entities.find((e) => e.id === sel.entity_id))
    .filter((e): e is FlowEndpointEntity => !!e);
  return [...explicit, ...fromWildcards];
}

export function countSideEntities(side: FlowEndpointSide, catalog: FlowEndpointCatalog): number {
  return resolveSideEntities(side, catalog).length;
}

export function inheritedClassification(
  sources: FlowEndpointSide,
  destinations: FlowEndpointSide,
  catalog: FlowEndpointCatalog
): { level: string; piiLabels: string[]; hasWildcard: boolean } {
  const allEntities = [
    ...resolveSideEntities(sources, catalog),
    ...resolveSideEntities(destinations, catalog),
  ];
  const hasWildcard = sources.systems.length > 0 || destinations.systems.length > 0;

  let maxRank = -1;
  let level = "internal";
  const piiLabels: string[] = [];

  for (const entity of allEntities) {
    const cls = entityClassification(entity);
    if (cls) {
      const rank = CLASSIFICATION_RANK[cls] ?? 0;
      if (rank > maxRank) {
        maxRank = rank;
        level = cls === "pii" ? "restricted" : cls;
      }
    }
    if (entityHasPii(entity) && entity.system_name) {
      piiLabels.push(`${entity.system_name} · ${entity.name}`);
    }
  }

  if (hasWildcard && maxRank < CLASSIFICATION_RANK.restricted) {
    level = "restricted";
  }

  return { level, piiLabels, hasWildcard };
}

export type GroupedEndpointChip = {
  systemId: string;
  systemName: string;
  items: Array<{ id: string; name: string; wildcard?: boolean }>;
};

/**
 * Build display groups from a side selection — no catalog needed.
 * Wildcard systems show "All entities" chip.
 * Individual entities (from non-wildcard systems) are grouped by their system.
 */
export function groupSideChips(side: FlowEndpointSide): GroupedEndpointChip[] {
  const groups = new Map<string, GroupedEndpointChip>();

  for (const sys of side.systems) {
    groups.set(sys.system_id, {
      systemId: sys.system_id,
      systemName: sys.system_name.toUpperCase(),
      items: [{ id: `all-${sys.system_id}`, name: "All entities", wildcard: true }],
    });
  }

  for (const ent of side.entities) {
    const key = ent.system_id ?? "unassigned";
    if (!groups.has(key)) {
      groups.set(key, {
        systemId: key,
        systemName: (ent.system_name ?? "Unassigned").toUpperCase(),
        items: [],
      });
    }
    groups.get(key)!.items.push({ id: ent.entity_id, name: ent.entity_name });
  }

  return Array.from(groups.values()).filter((g) => g.items.length > 0);
}

export function selectionSummary(side: FlowEndpointSide, catalog: FlowEndpointCatalog): string {
  const systemCount = side.systems.length;
  const entityCount = side.entities.length;
  const covered = countSideEntities(side, catalog);
  const parts: string[] = [];
  if (systemCount) parts.push(`${systemCount} system${systemCount === 1 ? "" : "s"} selected`);
  if (entityCount) parts.push(`${entityCount} entit${entityCount === 1 ? "y" : "ies"} also selected`);
  if (systemCount && covered) parts.push(`covers ${covered} entit${covered === 1 ? "y" : "ies"}`);
  return parts.join(" · ") || "Select at least one system to continue";
}

export function toEntitySelection(entity: FlowEndpointEntity): FlowEntitySelection {
  return {
    entity_id: entity.id,
    entity_name: entity.name,
    system_id: entity.system_id,
    system_name: entity.system_name,
  };
}

export function toSystemSelection(
  system: FlowEndpointCatalog["systems"][number]
): FlowSystemSelection {
  return {
    system_id: system.id,
    system_name: system.name,
    wildcard: true,
  };
}
