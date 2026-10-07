import type { AiCatalogEntry, AiFeature, AiFeatureStatus } from "@minea/types";
import { lineAnnualCents, readCostLines, type CostLine } from "@/lib/cost/math";
import { normalizeTerm } from "@/lib/setup/match-tools";
import { catalogEntriesFor, catalogEntry } from "./catalog";
import { isCustomerOrFinancial } from "./sensitive";

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

export type FeatureChanges = Partial<Pick<AiFeature, "status" | "audience" | "sees_company_data" | "vendor_trains">>;

/** Edits a stored feature. A status change records who confirmed it ("unreviewed" clears that). */
export function updateFeature(
  object: FeatureHost,
  key: string,
  changes: FeatureChanges,
  user: string,
  now: string = new Date().toISOString()
): FeaturePatch {
  const features = readFeatures(object.properties);
  if (!features.some((item) => item.key === key)) throw new Error(`No AI feature ${key} on this record`);
  const confirmed =
    changes.status === undefined
      ? {}
      : changes.status === "unreviewed"
        ? { confirmed_at: null, confirmed_by: null }
        : { confirmed_at: now, confirmed_by: user };
  return {
    properties: { ai_features: features.map((item) => (item.key === key ? { ...item, ...changes, ...confirmed } : item)) },
  };
}

/**
 * A feature the catalog doesn't know: key "custom-<slug>", answers unknown, turned on.
 * Pass `key` to replay an add: if that key is already on the record the patch changes nothing.
 */
export function addCustomFeature(
  object: FeatureHost,
  name: string,
  user: string,
  now: string = new Date().toISOString(),
  key?: string
): FeaturePatch {
  const label = name.trim();
  if (!label) throw new Error("Type the AI feature's name");
  const features = readFeatures(object.properties);
  if (key && features.some((item) => item.key === key)) return { properties: { ai_features: features } };
  const taken = new Set(features.map((item) => item.key));
  let next = key ?? `custom-${normalizeTerm(label).replace(/ /g, "-") || "feature"}`;
  if (!key) for (let n = 2, base = next; taken.has(next); n += 1) next = `${base}-${n}`;
  const added: AiFeature = {
    key: next,
    name: label,
    status: "on",
    audience: null,
    sees_company_data: "unknown",
    vendor_trains: "unknown",
    source: "user",
    confirmed_at: now,
    confirmed_by: user,
  };
  return { properties: { ai_features: [...features, added] } };
}

/**
 * One click on "Add … as your own". The key is fixed the first time the build runs (the queue's preview),
 * so every later replay (the real send, a rebuild on a newer server answer) adds the same feature once.
 */
export function customFeatureAdd(name: string, user: string, now: string = new Date().toISOString()) {
  let key: string | undefined;
  return (object: FeatureHost): FeaturePatch => {
    const before = new Set(readFeatures(object.properties).map((item) => item.key));
    const patch = addCustomFeature(object, name, user, now, key);
    key ??= patch.properties.ai_features.find((item) => !before.has(item.key))?.key;
    return patch;
  };
}

export type FeatureFlag = { id: "F1" | "F2"; severity: "high" | "check"; title: string };

/** F1 / F2 from §6.3 for one feature on its host (the full flag list is Step E). */
export function featureFlags(feature: AiFeature, host: FeatureHost): FeatureFlag[] {
  if (feature.status !== "on" && feature.status !== "piloting") return [];
  const flags: FeatureFlag[] = [];
  if (isCustomerOrFinancial(host)) {
    if (feature.sees_company_data === "yes") flags.push({ id: "F1", severity: "high", title: "Can see customer or financial data" });
    if (feature.sees_company_data === "unknown") flags.push({ id: "F1", severity: "check", title: "Check: can it see customer or financial data?" });
  }
  if (feature.vendor_trains === "yes") flags.push({ id: "F2", severity: "high", title: "Vendor may train on your data" });
  if (feature.vendor_trains === "unknown") flags.push({ id: "F2", severity: "check", title: "Check: does the vendor train on your data?" });
  return flags;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
}

/** "25 seats × $21 /user/mo = $6,300 / yr", "Included in your plan", the usage note, or "". */
export function featureCostLabel(feature: AiFeature, properties: Record<string, unknown> | null | undefined): string {
  const line = feature.cost_line_id ? (readCostLines(properties) ?? []).find((item) => item.id === feature.cost_line_id) : undefined;
  if (line && line.calculation.kind === "per_user") {
    const { seats, unit_price_monthly_cents: price } = line.calculation;
    return `${seats} ${seats === 1 ? "seat" : "seats"} × ${dollars(price)} /user/mo = ${dollars(lineAnnualCents(line))} / yr`;
  }
  const entry = catalogEntry(feature.key);
  if (!entry) return "";
  if (entry.pricing.model === "included") return "Included in your plan";
  if (entry.pricing.model === "usage") return entry.pricing.note;
  return "";
}

/** Applications / Platforms table cell, e.g. "2 on · 1 piloting · 1 to review"; "" when there is nothing to say. */
export function aiColumnLabel(object: FeatureHost): string {
  const features = readFeatures(object.properties);
  const on = features.filter((item) => item.status === "on").length;
  const piloting = features.filter((item) => item.status === "piloting").length;
  const review = features.filter((item) => item.status === "unreviewed").length + suggestedFeatures(object).length;
  return [on ? `${on} on` : "", piloting ? `${piloting} piloting` : "", review ? `${review} to review` : ""].filter(Boolean).join(" · ");
}

type TouchEdge = { type: string; from_object_id: string; from_type: string; to_object_id: string };

/** Agents with a reads / writes edge into this record, for the section footer. */
export function agentsTouching(
  objectId: string,
  edges: readonly TouchEdge[],
  names: ReadonlyMap<string, string>
): { id: string; name: string; verb: string }[] {
  return edges
    .filter((edge) => edge.to_object_id === objectId && edge.from_type === "agent" && (edge.type === "reads" || edge.type === "writes"))
    .map((edge) => ({
      id: edge.from_object_id,
      name: names.get(edge.from_object_id) ?? "An agent",
      verb: edge.type === "reads" ? "reads from it" : "writes to it",
    }));
}
