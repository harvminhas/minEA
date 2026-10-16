/**
 * Ask's record filter: one filter over every field the Add flow collects. Mirrors the API's
 * filter_records (apps/api/app/ai/ask/record_filters.py: same keys, same loose matching), so a chip
 * edited on any answer re-runs here, in the browser, with no AI call.
 *
 * Nothing is hardcoded per vendor. Quick answers match the question against names that exist in
 * THIS workspace's data: vendors, owner teams and people, tenants, cloud providers (the fixed
 * provider list in cloud-regions.json, only those in use) and regions on tenant links.
 */
import type { MinEAObject } from "@minea/types";
import { displayVendor, type CatalogRow } from "@/lib/model-catalog";
import { PROVIDERS, regionByKey, tenantProvider, type CustomRegion } from "@/lib/hosting/cloud";
import { exactCatalogTool, TOOL_CATALOG } from "@/lib/setup/match-tools";

export type RecordFilters = {
  type?: string;
  vendor?: string;
  owner_team?: string;
  owner_person?: string;
  owner?: string; // "none"
  hosting?: string;
  provider?: string;
  tenant?: string;
  region?: string;
  server?: string;
  ai_on?: boolean;
  renewal_within_days?: number;
  cost_min?: number;
  cost_max?: number;
  lifecycle?: string;
  criticality?: string;
  name?: string;
};
export type FilterKey = keyof RecordFilters;
export const FILTER_KEYS: FilterKey[] = [
  "type", "vendor", "owner_team", "owner_person", "owner", "hosting", "provider", "tenant", "region",
  "server", "ai_on", "renewal_within_days", "cost_min", "cost_max", "lifecycle", "criticality", "name",
];
export const FILTER_LABEL: Record<FilterKey, string> = {
  type: "Type", vendor: "Vendor", owner_team: "Owner team", owner_person: "Named owner", owner: "Owner",
  hosting: "Where it runs", provider: "Provider", tenant: "Tenant", region: "Region", server: "Server",
  ai_on: "AI", renewal_within_days: "Renews within", cost_min: "Cost at least", cost_max: "Cost at most",
  lifecycle: "Lifecycle", criticality: "Criticality", name: "Name has",
};

/** hosting_model values the Add cards save, with the words people use for them. */
export const HOSTING: Record<string, { label: string; words: string[] }> = {
  saas: { label: "SaaS", words: ["saas", "software as a service"] },
  own_cloud: { label: "Our cloud", words: ["own_cloud", "our cloud", "own cloud", "private cloud", "public_cloud"] },
  on_premise: { label: "Our server", words: ["on_premise", "on prem", "on premises", "our server", "our servers", "own server", "self_hosted"] },
  desktop: { label: "On people's computers", words: ["desktop", "on people's computers", "people's computers", "laptops"] },
};

export type RecordFacts = {
  row: CatalogRow;
  vendors: string[];
  hosting: string;
  tenants: string[];
  providers: string[];
  regions: string[]; // region keys
  servers: string[];
  aiOn: boolean;
};

type Rel = { from_object_id: string; to_object_id: string; type: string; attributes?: Record<string, unknown> | null };

export function fold(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

export function hostingKey(value: string): string {
  const v = value.trim().toLowerCase().replace(/-/g, " ");
  for (const [key, info] of Object.entries(HOSTING)) {
    if (v === key || info.words.some((word) => word.replace(/-/g, " ") === v)) return key;
  }
  return v;
}

export function providerLabel(id: string): string {
  return PROVIDERS.find((provider) => provider.id === id)?.label ?? id;
}

export function regionName(key: string, custom: CustomRegion[] = []): string {
  return regionByKey(key, custom)?.name ?? key;
}

export function buildFacts(rows: CatalogRow[], objects: readonly MinEAObject[] = [], relationships: readonly Rel[] = []): RecordFacts[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  return rows.map((row) => {
    const props = (row.object?.properties ?? {}) as Record<string, unknown>;
    const vendors = [row.vendor, ...(row.vendorKeys ?? [])].map((v) => displayVendor(v)).filter(Boolean);
    // No vendor recorded: the tool catalogue's vendor for this name (Adobe Photoshop -> Adobe).
    if (!vendors.length) {
      const inferred = catalogVendor(row.name, String(props.catalog_tool ?? ""));
      if (inferred) vendors.push(inferred);
    }
    const facts: RecordFacts = { row, vendors, hosting: hostingKey(String(props.hosting_model ?? "")), tenants: [], providers: [], regions: [], servers: [], aiOn: false };
    if (row.object?.type === "cloud_service") {
      const pid = tenantProvider(props, row.name);
      facts.providers.push(pid);
      facts.tenants.push(row.name);
      const info = PROVIDERS.find((provider) => provider.id === pid);
      if (info && pid !== "other") facts.vendors.push(info.label, displayVendor(info.vendor) || info.vendor);
    }
    for (const rel of relationships) {
      if (rel.from_object_id !== row.id || (rel.type !== "runs_on" && rel.type !== "built_on")) continue;
      const target = byId.get(rel.to_object_id);
      if (!target) continue;
      if (target.type === "cloud_service") {
        facts.tenants.push(target.name);
        facts.providers.push(tenantProvider(target.properties ?? {}, target.name));
        const key = String((rel.attributes ?? {}).region_key ?? "");
        if (key) facts.regions.push(key);
      } else if (target.type === "model" && rel.type === "runs_on") {
        facts.servers.push(target.name);
      }
    }
    const features = props.ai_features;
    facts.aiOn = Array.isArray(features) && features.some((feature) => (feature as { status?: string })?.status === "on");
    facts.vendors = unique(facts.vendors.map(titleVendor));
    return facts;
  });
}

/** The catalogue vendor for an item's name (or its catalog_tool key), when exactly one tool matches. */
export function catalogVendor(name: string, catalogKey = ""): string {
  const byKey = catalogKey ? TOOL_CATALOG.find((tool) => fold(tool.name) === fold(catalogKey)) : undefined;
  return (byKey ?? exactCatalogTool(name))?.vendor ?? "";
}

function titleVendor(value: string): string {
  return value && value === value.toLowerCase() ? value.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : value;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = fold(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loose(wanted: string, values: string[]): boolean {
  const w = fold(wanted);
  if (!w) return true;
  return values.some((value) => {
    const v = fold(value);
    return Boolean(v) && (v === w || (w.length >= 3 && v.includes(w)) || (v.length >= 3 && w.includes(v)));
  });
}

export function matchesFilters(facts: RecordFacts, filters: RecordFilters, today: Date = new Date(), custom: CustomRegion[] = []): boolean {
  const row = facts.row;
  if (filters.type) {
    const t = filters.type.toLowerCase();
    if (/^app/.test(t) && row.kind !== "application") return false;
    if (/^(infra|platform|server)/.test(t) && row.kind === "application") return false;
  }
  if (filters.vendor && !loose(filters.vendor, facts.vendors)) return false;
  if (filters.owner && /^(none|no|missing)$/i.test(filters.owner) && (row.ownerTeam || row.ownerPerson)) return false;
  if (filters.owner_team && !loose(filters.owner_team, [row.ownerTeam])) return false;
  if (filters.owner_person && !loose(filters.owner_person, [row.ownerPerson])) return false;
  if (filters.hosting && facts.hosting !== hostingKey(filters.hosting)) return false;
  if (filters.provider && !loose(filters.provider, [...facts.providers, ...facts.providers.map(providerLabel)])) return false;
  if (filters.tenant && !loose(filters.tenant, facts.tenants)) return false;
  if (filters.region && !loose(filters.region, [...facts.regions, ...facts.regions.map((key) => regionName(key, custom))])) return false;
  if (filters.server && !loose(filters.server, facts.servers)) return false;
  if (filters.ai_on !== undefined && facts.aiOn !== filters.ai_on) return false;
  if (filters.renewal_within_days !== undefined) {
    const renews = row.renewalDate;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getTime() + filters.renewal_within_days * 86400000);
    if (!renews || renews < start || renews > end) return false;
  }
  if (filters.cost_min !== undefined && (row.annualCostNumber == null || row.annualCostNumber < filters.cost_min)) return false;
  if (filters.cost_max !== undefined && (row.annualCostNumber == null || row.annualCostNumber > filters.cost_max)) return false;
  if (filters.lifecycle && fold(row.lifecycleLabel || row.lifecycle) !== fold(filters.lifecycle)) return false;
  if (filters.criticality && fold(row.criticalityLabel) !== fold(filters.criticality)) return false;
  if (filters.name && !fold(row.name).includes(fold(filters.name))) return false;
  return true;
}

export function filterFacts(all: RecordFacts[], filters: RecordFilters, today?: Date, custom?: CustomRegion[]): RecordFacts[] {
  return all
    .filter((facts) => matchesFilters(facts, filters, today, custom))
    .sort((a, b) => (b.row.annualCostNumber ?? 0) - (a.row.annualCostNumber ?? 0) || a.row.name.localeCompare(b.row.name));
}

/** The API's filters (filter_records args) as RecordFilters; unknown keys and blanks dropped. */
export function filtersFromPayload(raw: Record<string, unknown> | null | undefined): RecordFilters {
  const out: RecordFilters = {};
  for (const key of FILTER_KEYS) {
    const value = raw?.[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "ai_on") out.ai_on = value === true || /^(true|yes|1|on)$/i.test(String(value));
    else if (key === "renewal_within_days" || key === "cost_min" || key === "cost_max") {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.round(n);
    } else (out as Record<string, unknown>)[key] = String(value);
  }
  return out;
}

export function chipValue(key: FilterKey, filters: RecordFilters, custom: CustomRegion[] = []): string {
  const value = filters[key];
  if (value === undefined) return "";
  if (key === "ai_on") return value ? "turned on" : "off";
  if (key === "owner") return "none";
  if (key === "hosting") return HOSTING[String(value)]?.label ?? String(value);
  if (key === "provider") return providerLabel(String(value));
  if (key === "region") return regionByKey(String(value), custom)?.name ?? String(value);
  if (key === "renewal_within_days") return `${value} days`;
  if (key === "cost_min" || key === "cost_max") return `$${Number(value).toLocaleString("en-US")}`;
  return String(value);
}

/** Values a chip can switch to: only what exists in this workspace. */
export function chipOptions(key: FilterKey, all: RecordFacts[], custom: CustomRegion[] = []): { value: string; label: string }[] {
  const pairs: [string, string][] = [];
  for (const facts of all) {
    if (key === "vendor") facts.vendors.forEach((v) => pairs.push([v, v]));
    if (key === "owner_team" && facts.row.ownerTeam) pairs.push([facts.row.ownerTeam, facts.row.ownerTeam]);
    if (key === "owner_person" && facts.row.ownerPerson) pairs.push([facts.row.ownerPerson, facts.row.ownerPerson]);
    if (key === "tenant") facts.tenants.forEach((v) => pairs.push([v, v]));
    if (key === "provider") facts.providers.forEach((v) => pairs.push([v, providerLabel(v)]));
    if (key === "region") facts.regions.forEach((v) => pairs.push([v, regionName(v, custom)]));
    if (key === "server") facts.servers.forEach((v) => pairs.push([v, v]));
    if (key === "hosting" && facts.hosting && HOSTING[facts.hosting]) pairs.push([facts.hosting, HOSTING[facts.hosting].label]);
    if (key === "lifecycle" && facts.row.lifecycleLabel) pairs.push([facts.row.lifecycleLabel, facts.row.lifecycleLabel]);
    if (key === "criticality" && facts.row.criticalityLabel) pairs.push([facts.row.criticalityLabel, facts.row.criticalityLabel]);
  }
  const seen = new Set<string>();
  return pairs
    .filter(([value]) => {
      const k = fold(value);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Quick answers: names from the data, found in the question ─────────────

export type Term = { key: FilterKey; value: string; label: string; text: string };

const PRIORITY: FilterKey[] = ["tenant", "provider", "region", "server", "vendor", "owner_team", "owner_person"];

/** Every name in this workspace a question could mention, with the filter it means. */
export function vocabulary(all: RecordFacts[], custom: CustomRegion[] = []): Term[] {
  const terms: Term[] = [];
  const add = (key: FilterKey, value: string, label: string, text = label) => {
    if (norm(text).length >= 2) terms.push({ key, value, label, text });
  };
  for (const facts of all) {
    facts.tenants.forEach((t) => add("tenant", t, t));
    facts.providers.filter((p) => p !== "other").forEach((p) => add("provider", p, providerLabel(p)));
    facts.regions.forEach((key) => add("region", key, regionName(key, custom)));
    facts.servers.forEach((s) => add("server", s, s));
    facts.vendors.forEach((v) => add("vendor", v, v));
    if (facts.row.ownerTeam) add("owner_team", facts.row.ownerTeam, facts.row.ownerTeam);
    if (facts.row.ownerPerson) add("owner_person", facts.row.ownerPerson, facts.row.ownerPerson);
  }
  return terms;
}

function norm(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Plain words that turn a matched name into a narrower question (generic, never a vendor). */
function modifiers(question: string): RecordFilters {
  const q = question.toLowerCase();
  const out: RecordFilters = {};
  if (/\b(no owner|without (an )?owner|unowned|nobody owns|no one owns)\b/.test(q)) out.owner = "none";
  if (/\bai\b.{0,20}\b(turned on|switched on|enabled|on)\b|\b(with|have|has|using|use) ai\b|\bai[- ]enabled\b/.test(q)) out.ai_on = true;
  const renew = q.match(/renew\w*\b.{0,20}?(\d{1,3})\s*days?/);
  if (renew) out.renewal_within_days = Number(renew[1]);
  for (const [key, info] of Object.entries(HOSTING)) {
    if (info.words.some((word) => !word.includes("_") && new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\']/g, "\\$&")}\\b`).test(q))) out.hosting = key;
  }
  return out;
}

export type QuestionMatch = { filters: RecordFilters; terms: Term[] };

/**
 * Names from the workspace found in the question, longest first, word-bounded, never overlapping.
 * Short names (under 3 letters, e.g. a team called "IT") only count when written with the same case.
 */
export function matchQuestion(question: string, all: RecordFacts[], custom: CustomRegion[] = []): QuestionMatch {
  const q = ` ${norm(question)} `;
  const terms = vocabulary(all, custom)
    .map((term) => ({ term, text: norm(term.text) }))
    .sort((a, b) => b.text.length - a.text.length || PRIORITY.indexOf(a.term.key) - PRIORITY.indexOf(b.term.key));
  const taken: [number, number][] = [];
  const found: Term[] = [];
  const filters: RecordFilters = {};
  for (const { term, text } of terms) {
    if (filters[term.key] !== undefined) continue;
    const at = q.indexOf(` ${text} `);
    if (at < 0) continue;
    if (text.replace(/ /g, "").length < 3 && !new RegExp(`\\b${term.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(question)) continue;
    const span: [number, number] = [at, at + text.length + 1];
    if (taken.some(([s, e]) => span[0] < e && s < span[1])) continue;
    taken.push(span);
    found.push(term);
    (filters as Record<string, unknown>)[term.key] = term.value;
  }
  if (!found.length) return { filters: {}, terms: [] };
  return { filters: { ...filters, ...modifiers(question) }, terms: found };
}

// ─── "Do we use X?" ────────────────────────────────────────────────────────

const YES_NO = /^\s*(?:do|does|are|is)\s+(?:we|you|our (?:company|team|business)|the company|anyone|anybody)\s+(?:still\s+|currently\s+|already\s+)?(?:use|using|have|own|run|running|pay for|paying for|license|licence|subscribe to)\s+(?:any(?:thing)?\s+(?:from\s+)?|an?\s+|the\s+)?(.+?)\s*(?:products?|apps?|applications?|tools?|software|licen[cs]es?|subscriptions?)?\s*\??\s*$/i;

/** The thing asked about in "do we use X?" / "do we have X?" (null when the question isn't that shape). */
export function yesNoSlot(question: string): string | null {
  const m = question.match(YES_NO);
  const slot = m?.[1]?.trim().replace(/[?.!]+$/, "") ?? "";
  if (!slot || slot.split(/\s+/).length > 4) return null;
  return slot;
}

/** Items whose name has the slot as a whole word or word prefix ("Adobe" in "Adobe Photoshop"). */
export function nameWordMatches(all: RecordFacts[], slot: string): RecordFacts[] {
  const wanted = norm(slot);
  if (wanted.replace(/ /g, "").length < 3) return [];
  return all.filter((facts) => (` ${norm(facts.row.name)} `).includes(` ${wanted} `));
}

/** Filters for a yes/no slot: a vendor/tenant/owner name from the data first, else a name word. */
export function slotFilters(slot: string, all: RecordFacts[], custom: CustomRegion[] = []): QuestionMatch | null {
  const viaData = matchQuestion(slot, all, custom);
  if (viaData.terms.length) return viaData;
  if (nameWordMatches(all, slot).length) return { filters: { name: slot }, terms: [{ key: "name", value: slot, label: slot, text: slot }] };
  return null;
}
