import type { AiCatalogEntry, AiFeature, AiFeatureStatus } from "@minea/types";
import { readCostLines, type CostLine } from "@/lib/cost/math";
import { catalogEntriesFor, catalogEntry } from "./catalog";

type FeatureHost = { type: string; name: string; status?: string | null; properties?: Record<string, unknown> | null };
export type FeaturePatch = { properties: { ai_features: AiFeature[]; cost_lines?: CostLine[] } };

function isFeature(value: unknown): value is AiFeature {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.key === "string" && item.key.trim() !== "" && typeof item.name === "string" && item.name.trim() !== "";
}

export function readFeatures(properties: Record<string, unknown> | null | undefined): AiFeature[] {
  const raw = properties?.ai_features;
  return Array.isArray(raw) ? raw.filter(isFeature) : [];
}

/** Catalog entries for this host that aren't stored yet. */
export function suggestedFeatures(object: FeatureHost): AiCatalogEntry[] {
  const stored = new Set(readFeatures(object.properties).map((feature) => feature.key));
  return catalogEntriesFor(object).filter((entry) => !stored.has(entry.key));
}

export function confirmFeature(
  object: FeatureHost,
  entry: AiCatalogEntry,
  status: AiFeatureStatus,
  user: string,
  now: string = new Date().toISOString()
): FeaturePatch {
  const features = readFeatures(object.properties);
  const confirmed = status === "unreviewed" ? { confirmed_at: null, confirmed_by: null } : { confirmed_at: now, confirmed_by: user };
  const existing = features.find((feature) => feature.key === entry.key);
  if (existing) {
    return { properties: { ai_features: features.map((feature) => (feature.key === entry.key ? { ...feature, status, ...confirmed } : feature)) } };
  }
  const added: AiFeature = {
    key: entry.key,
    name: entry.name,
    status,
    audience: entry.defaults.audience,
    sees_company_data: entry.defaults.sees_company_data,
    vendor_trains: entry.defaults.vendor_trains,
    source: "catalog",
    ...confirmed,
  };
  return { properties: { ai_features: [...features, added] } };
}

/** Adds, updates or (seats <= 0) removes the feature's tagged per-user cost line. */
export function setFeatureSeats(
  object: FeatureHost,
  key: string,
  seats: number,
  priceCents: number,
  user: string = "",
  now: string = new Date().toISOString()
): FeaturePatch {
  const features = readFeatures(object.properties);
  const feature = features.find((item) => item.key === key);
  if (!feature) throw new Error(`No AI feature ${key} on this record`);
  const lines = readCostLines(object.properties) ?? [];
  const lineId = feature.cost_line_id ?? null;
  const current = lineId ? lines.find((line) => line.id === lineId) : undefined;
  const count = Math.max(0, Math.floor(seats));
  const price = Math.max(0, Math.round(priceCents));

  if (count === 0) {
    return {
      properties: {
        ai_features: features.map((item) => (item.key === key ? { ...item, cost_line_id: null } : item)),
        cost_lines: lines.filter((line) => line.id !== lineId),
      },
    };
  }

  const calculation = { kind: "per_user" as const, seats: count, unit_price_monthly_cents: price };
  const next: CostLine = current
    ? { ...current, calculation, ai_feature: key, updated_at: now, updated_by: user }
    : {
        id: `ai-${key}`,
        type: "subscription",
        label: `${feature.name} add-on`,
        frequency: "annual",
        calculation,
        vendor: catalogEntry(key)?.vendor ?? null,
        source: "estimate",
        ai_feature: key,
        created_at: now,
        created_by: user,
        updated_at: now,
        updated_by: user,
      };
  return {
    properties: {
      ai_features: features.map((item) => (item.key === key ? { ...item, cost_line_id: next.id } : item)),
      cost_lines: current ? lines.map((line) => (line.id === next.id ? next : line)) : [...lines, next],
    },
  };
}

/** Drops the feature and any cost line tagged with it. */
export function removeFeature(object: FeatureHost, key: string): FeaturePatch {
  const features = readFeatures(object.properties);
  const feature = features.find((item) => item.key === key);
  const remaining = features.filter((item) => item.key !== key);
  const lines = readCostLines(object.properties);
  const tagged = (line: CostLine) => line.ai_feature === key || (!!feature?.cost_line_id && line.id === feature.cost_line_id);
  if (!lines || !lines.some(tagged)) return { properties: { ai_features: remaining } };
  return { properties: { ai_features: remaining, cost_lines: lines.filter((line) => !tagged(line)) } };
}
