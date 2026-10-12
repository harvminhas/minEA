/**
 * Sensitive data page (STEP 2): one row per data type, the apps that hold it and the AI that can reach it.
 * Pure helpers; the page component only renders and saves what these return.
 */
import {
  DATA_KINDS,
  DATA_OBJECT_LINKS,
  dataObjectKind,
  readHoldsData,
  sensitiveKinds,
  suggestedHoldsData,
  type HoldsKind,
  type SensitiveKind,
} from "./ai/sensitive";
import type { HoldsData } from "@minea/types";

export type SdObject = { id: string; type: string; name: string; status?: string | null; properties?: Record<string, unknown> | null };
export type SdEdge = { id?: string; type: string; from_object_id: string; to_object_id: string };

export const APP_TYPES = new Set(["application", "cloud_service"]);
export const CHECKLIST_KINDS: HoldsKind[] = ["customer", "employee", "financial"];
export const CHECKLIST_QUESTION = "Which of these hold customer / employee / financial data?";
const ACTIVE_FEATURE = new Set(["on", "piloting"]);
const AGENT_LINKS = new Set(["reads", "writes"]);
const ACTIVE_AGENT = new Set(["active", "under_evaluation"]);

export type SdApp = { id: string; name: string; suggested: boolean };
export type SdAi = { id: string; name: string; kind: "agent" | "feature"; via: string };
export type SdRow = {
  key: string;
  label: string;
  kind: SensitiveKind | "custom";
  dataObjectIds: string[];
  apps: SdApp[];
  ai: SdAi[];
};

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function listApps<T extends SdObject>(objects: readonly T[]): T[] {
  return objects.filter((object) => APP_TYPES.has(object.type) && object.status !== "retired").sort(byName);
}

function hasStoredAnswer(app: SdObject): boolean {
  return Array.isArray(app.properties?.holds_data);
}

/** Does any app still lack a confirmed answer? Then the page opens with the checklist. */
export function needsChecklist(objects: readonly SdObject[]): boolean {
  return listApps(objects).some((app) => !hasStoredAnswer(app));
}

/** Pre-ticks: the stored answer when there is one, otherwise the catalog category default. */
export function checklistInitial(objects: readonly SdObject[]): Record<string, HoldsKind[]> {
  const out: Record<string, HoldsKind[]> = {};
  for (const app of listApps(objects)) {
    out[app.id] = hasStoredAnswer(app)
      ? (readHoldsData(app.properties?.holds_data).filter((kind) => kind !== "none") as HoldsKind[])
      : suggestedHoldsData(app);
  }
  return out;
}

/** What Confirm saves: every unanswered app, and every answered app whose ticks changed. Nothing ticked saves ["none"]. */
export function checklistPatches(objects: readonly SdObject[], answers: Record<string, HoldsKind[]>): { id: string; holds_data: HoldsData[] }[] {
  const patches: { id: string; holds_data: HoldsData[] }[] = [];
  for (const app of listApps(objects)) {
    const picked = CHECKLIST_KINDS.filter((kind) => (answers[app.id] ?? []).includes(kind));
    const next: HoldsData[] = picked.length ? readHoldsData(picked) : ["none"];
    const stored = readHoldsData(app.properties?.holds_data);
    if (hasStoredAnswer(app) && stored.join(",") === next.join(",")) continue;
    patches.push({ id: app.id, holds_data: next });
  }
  return patches;
}

function featuresOn(app: SdObject): { key: string; name: string }[] {
  const raw = app.properties?.ai_features;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is { key: string; name: string; status: string } =>
    !!item && typeof item === "object" && typeof (item as { key?: unknown }).key === "string" && ACTIVE_FEATURE.has(String((item as { status?: unknown }).status))
  ).map((item) => ({ key: item.key, name: typeof item.name === "string" && item.name ? item.name : item.key }));
}

export function buildSensitiveRows(objects: readonly SdObject[], edges: readonly SdEdge[]): SdRow[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const apps = listApps(objects);
  const appIds = new Set(apps.map((app) => app.id));
  const agents = objects.filter((object) => object.type === "agent" && ACTIVE_AGENT.has(String(object.status ?? "")));
  const agentIds = new Set(agents.map((agent) => agent.id));

  const rows: SdRow[] = DATA_KINDS.map(({ kind, label }) => ({ key: kind, label, kind, dataObjectIds: [], apps: [], ai: [] }));
  const customs = objects.filter((object) => object.type === "data_object" && object.properties?.sensitive_kind === "custom").sort(byName);
  for (const entity of customs) rows.push({ key: entity.id, label: entity.name, kind: "custom", dataObjectIds: [entity.id], apps: [], ai: [] });
  const rowFor = new Map(rows.map((row) => [row.key, row]));
  for (const entity of objects) {
    const kind = dataObjectKind(entity);
    if (kind) rowFor.get(kind)!.dataObjectIds.push(entity.id);
  }

  const addApp = (row: SdRow, app: SdObject, suggested: boolean) => {
    const seen = row.apps.find((item) => item.id === app.id);
    if (seen) seen.suggested = seen.suggested && suggested;
    else row.apps.push({ id: app.id, name: app.name, suggested });
  };
  for (const app of apps) {
    const stored = hasStoredAnswer(app);
    for (const kind of sensitiveKinds(app)) addApp(rowFor.get(kind)!, app, !stored);
  }
  for (const edge of edges) {
    if (!DATA_OBJECT_LINKS.has(edge.type) || !appIds.has(edge.from_object_id)) continue;
    const entity = byId.get(edge.to_object_id);
    if (!entity || entity.type !== "data_object") continue;
    const row = rowFor.get(dataObjectKind(entity) ?? (entity.properties?.sensitive_kind === "custom" ? entity.id : ""));
    if (row) addApp(row, byId.get(edge.from_object_id)!, false);
  }

  for (const row of rows) {
    row.apps.sort(byName);
    const reach = new Map<string, SdAi>();
    const inRow = new Set([...row.apps.map((app) => app.id), ...row.dataObjectIds]);
    for (const app of row.apps) {
      for (const feature of featuresOn(byId.get(app.id)!)) {
        reach.set(`${app.id}:${feature.key}`, { id: app.id, name: feature.name, kind: "feature", via: app.name });
      }
    }
    for (const edge of edges) {
      if (!AGENT_LINKS.has(edge.type) || !agentIds.has(edge.from_object_id) || !inRow.has(edge.to_object_id)) continue;
      const agent = byId.get(edge.from_object_id)!;
      const target = byId.get(edge.to_object_id)!;
      const key = `agent:${agent.id}`;
      const prior = reach.get(key);
      const via = `${edge.type} ${target.name}`;
      if (prior) prior.via = `${prior.via}, ${via}`;
      else reach.set(key, { id: agent.id, name: agent.name, kind: "agent", via });
    }
    row.ai = [...reach.values()].sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === "agent" ? -1 : 1));
  }
  return rows;
}

/** Built-in checklist kinds are an app answer; the rest are an owns link to a data entity of that kind. */
export function isHoldsKind(kind: SensitiveKind | "custom"): kind is HoldsKind {
  return (CHECKLIST_KINDS as string[]).includes(kind);
}
