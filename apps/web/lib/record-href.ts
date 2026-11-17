/**
 * Where a record should open from Ask citations, the map, or a catalogue row.
 * Unknown types must not fall through to Servers & devices.
 */
import { capabilityDomainMapPath, capabilityOpenPath } from "@/lib/capability-detail";
import { connectorHref } from "@/lib/connected-via";
import { modelItemPath, type ModelSection } from "@/lib/mvp-paths";

export type RecordHrefObject = {
  id: string;
  type: string;
  properties?: Record<string, unknown> | null;
};

export type RecordHrefRow = {
  id: string;
  kind?: string;
  object?: { id?: string; type?: string; properties?: Record<string, unknown> | null } | null;
};

const KIND_SECTION: Record<"application" | "platform" | "runtime", ModelSection> = {
  application: "applications",
  platform: "platforms",
  runtime: "servers",
};

const CONNECTOR_TYPES = new Set(["api", "event", "integration_flow", "tool", "data_store", "data_object"]);

export function recordOpenPath(
  basePath: string,
  row: RecordHrefRow,
  objects: readonly RecordHrefObject[] = [],
): string | null {
  const found = objects.find((item) => item.id === row.id);
  const type = found?.type ?? row.object?.type ?? "";
  const object: RecordHrefObject | undefined = found
    ?? (type ? { id: row.id, type, properties: row.object?.properties ?? null } : undefined);
  const catalog = objects.length ? objects : object ? [object] : [];

  if (type === "capability") return capabilityOpenPath(basePath, row.id, [...catalog]);
  if (type === "business_domain") return capabilityDomainMapPath(basePath, row.id);

  if (type === "application" || type === "solution" || type === "technical_capability") {
    return modelItemPath(basePath, "applications", row.id);
  }
  if (type === "cloud_service") return modelItemPath(basePath, "platforms", row.id);
  if (type === "model") return modelItemPath(basePath, "servers", row.id);
  if (type === "agent") return modelItemPath(basePath, "agents", row.id);
  if (type === "ai_model") return modelItemPath(basePath, "ai-models", row.id);
  if (type === "location") return modelItemPath(basePath, "locations", row.id);
  if (type === "external_party") return modelItemPath(basePath, "vendors", row.id);

  if (CONNECTOR_TYPES.has(type)) return connectorHref(basePath, type, row.id);

  // Types with no page of their own (component, value_stream, tech_debt, …)
  // must not open Servers & devices — that was the Ask citation fallthrough.
  if (type) return null;

  if (row.kind === "application" || row.kind === "platform" || row.kind === "runtime") {
    return modelItemPath(basePath, KIND_SECTION[row.kind], row.id);
  }
  return null;
}
