import type { MinEAObject, Relationship } from "@minea/types";
import { vendorAmounts } from "@/lib/cost/service";
import { contractShares, nextRenewal, renewalInfo, type VendorContract } from "@/lib/contracts";
import type { CatalogRow } from "@/lib/model-catalog";
import { idleLicences, overlaps } from "@/lib/reports/cio-views";

/* ── Vendor names ─────────────────────────────────────────────────────────────────────────────── */

const SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|limited|ltd|llc|plc|gmbh|ag|sa|s\.a|bv|nv|pty|pte|holdings|group|technologies|software|systems)\b\.?/g;

/** Brands that roll up under their parent company. Keys and values are normalized names. */
export const BRAND_PARENT: Record<string, string> = {
  github: "microsoft",
  linkedin: "microsoft",
  "linkedin sales navigator": "microsoft",
  nuance: "microsoft",
  slack: "salesforce",
  tableau: "salesforce",
  mulesoft: "salesforce",
  heroku: "salesforce",
  trello: "atlassian",
  loom: "atlassian",
  looker: "google",
  youtube: "google",
  "google cloud": "google",
  alphabet: "google",
  aws: "amazon",
  "amazon web services": "amazon",
  vmware: "broadcom",
  "red hat": "ibm",
  instagram: "meta",
  whatsapp: "meta",
  facebook: "meta",
  "workplace from meta": "meta",
};

const DISPLAY: Record<string, string> = { microsoft: "Microsoft", salesforce: "Salesforce", atlassian: "Atlassian", google: "Google", amazon: "Amazon", broadcom: "Broadcom", ibm: "IBM", meta: "Meta" };

/** "Microsoft Corporation" -> "microsoft"; "Salesforce, Inc." -> "salesforce". */
export function normalizeVendor(raw: string | null | undefined): string {
  const lowered = (raw ?? "").toLowerCase().replace(/&/g, " and ").replace(/^the\s+/, "");
  const stripped = lowered.replace(/[(),]/g, " ").replace(SUFFIX, " ").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
  return stripped.replace(/\.$/, "") || lowered.trim();
}

/** The company a vendor name belongs to, brands rolled up: "GitHub, Inc." -> "microsoft". */
export function vendorKey(raw: string | null | undefined): string {
  const name = normalizeVendor(raw);
  return BRAND_PARENT[name] ?? name;
}

/** Display name for a vendor: the parent company for known brands and suffixed names, else as typed. */
export function displayVendorName(raw: string): string {
  return DISPLAY[vendorKey(raw)] ?? raw.trim().replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Ltd\.?|LLC|Limited|plc|GmbH)$/i, "");
}

export function sameVendor(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = vendorKey(a);
  return Boolean(ka) && ka === vendorKey(b);
}

/* ── Catalog products ─────────────────────────────────────────────────────────────────────────── */

export type CatalogTool = { name: string; aliases?: string[]; vendor?: string; category?: string; typicalAnnual?: number | null };

function term(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Catalog products a vendor sells (brands included), split into ones in our estate and the rest. */
export function vendorProducts(key: string, tools: readonly CatalogTool[], apps: readonly { name: string; properties?: Record<string, unknown> }[]) {
  const names = new Set<string>();
  for (const app of apps) {
    names.add(term(app.name));
    const tool = app.properties?.catalog_tool;
    if (typeof tool === "string" && tool) names.add(term(tool));
  }
  const sells = tools.filter((tool) => vendorKey(tool.vendor) === key);
  const inUse: CatalogTool[] = [];
  const other: CatalogTool[] = [];
  for (const tool of sells) {
    const hit = [tool.name, ...(tool.aliases ?? [])].some((alias) => names.has(term(alias)));
    (hit ? inUse : other).push(tool);
  }
  return { inUse, other, total: sells.length };
}

/** The catalog tool an app name matches (exact name or alias), when it has a vendor. */
export function catalogToolFor(name: string, tools: readonly CatalogTool[], catalogTool?: string): CatalogTool | null {
  const wanted = [term(name), catalogTool ? term(catalogTool) : ""].filter(Boolean);
  for (const tool of tools) {
    if (!tool.vendor) continue;
    if ([tool.name, ...(tool.aliases ?? [])].some((alias) => wanted.includes(term(alias)))) return tool;
  }
  return null;
}

/* ── Vendor summaries ─────────────────────────────────────────────────────────────────────────── */

export type VendorBadge = { kind: "concentration" | "overlap" | "single-critical"; label: string };

export type VendorSummary = {
  key: string;
  name: string;
  partyId: string | null;
  party: MinEAObject | null;
  apps: CatalogRow[];
  /** Annual dollars, each contract counted once. */
  spend: number;
  share: number;
  contracts: VendorContract[];
  renewal: { label: string; date: Date; days: number; source: string; noticeText: string | null } | null;
  idleCents: number;
  idleSeats: number;
  seats: number;
  critical: CatalogRow[];
  overlapsWith: { app: string; others: string[] }[];
  badges: VendorBadge[];
};

const CRITICAL = new Set(["critical", "business_critical", "mission_critical"]);

export function isCritical(row: CatalogRow): boolean {
  return CRITICAL.has((row.criticality || "").toLowerCase());
}

const DAY = 86_400_000;

export function vendorSummaries(input: {
  rows: readonly CatalogRow[];
  objects: readonly MinEAObject[];
  effective?: readonly MinEAObject[];
  relationships: readonly Relationship[];
  contracts: readonly VendorContract[];
  now?: Date;
}): VendorSummary[] {
  const now = input.now ?? new Date();
  const effective = input.effective ?? input.objects;
  const byKey = new Map<string, VendorSummary>();
  const parties = input.objects.filter((o) => o.type === "external_party");
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const ensure = (raw: string, party?: MinEAObject | null): VendorSummary | null => {
    const key = vendorKey(raw);
    if (!key) return null;
    let summary = byKey.get(key);
    if (!summary) {
      summary = {
        key, name: displayVendorName(raw), partyId: null, party: null, apps: [], spend: 0, share: 0, contracts: [],
        renewal: null, idleCents: 0, idleSeats: 0, seats: 0, critical: [], overlapsWith: [], badges: [],
      };
      byKey.set(key, summary);
    }
    if (party && !summary.party) {
      summary.party = party;
      summary.partyId = party.id;
      summary.name = party.name.trim() || summary.name;
    }
    return summary;
  };
  for (const party of parties) ensure(party.name, party);
  const addApp = (summary: VendorSummary, row: CatalogRow) => {
    if (!summary.apps.some((app) => app.id === row.id)) summary.apps.push(row);
  };
  const rowById = new Map(input.rows.map((row) => [row.id, row]));
  for (const row of input.rows) {
    const props = ((row.effective ?? row.object).properties ?? {}) as Record<string, unknown>;
    for (const amount of vendorAmounts(props, row.vendor)) {
      const summary = ensure(amount.vendor);
      if (!summary) continue;
      summary.spend += amount.dollars;
      addApp(summary, row);
    }
    if (row.vendor) {
      const summary = ensure(row.vendor);
      if (summary) addApp(summary, row);
    }
  }
  for (const rel of input.relationships) {
    if (rel.type !== "supplied_by") continue;
    const party = partyById.get(rel.to_object_id);
    const row = rowById.get(rel.from_object_id);
    if (!party || !row) continue;
    const summary = ensure(party.name, party);
    if (summary) addApp(summary, row);
  }
  for (const contract of input.contracts) {
    const party = contract.vendor_id ? partyById.get(contract.vendor_id) : undefined;
    const raw = party?.name ?? contract.vendor_name ?? "";
    const summary = raw ? ensure(raw, party ?? null) : null;
    if (!summary) continue;
    summary.contracts.push(contract);
    // Apps covered by the contract carry its cost already (split); a contract covering no apps adds here.
    if (contract.annual_cost_cents != null && contractShares(contract).size === 0) summary.spend += contract.annual_cost_cents / 100;
    for (const item of contract.items) {
      const row = rowById.get(item.object_id);
      if (row) addApp(summary, row);
    }
  }

  const idle = idleLicences(effective as never);
  const idleById = new Map(idle.rows.map((r) => [r.id, r]));
  const over = overlaps(effective as never, input.relationships as never);
  const all = [...byKey.values()];
  const total = all.reduce((sum, s) => sum + s.spend, 0);
  for (const s of all) {
    s.share = total > 0 ? s.spend / total : 0;
    for (const app of s.apps) {
      const r = idleById.get(app.id);
      if (r) {
        s.idleSeats += r.idle;
        s.idleCents += r.wastedCents ?? 0;
        s.seats += r.bought;
      }
    }
    s.critical = s.apps.filter(isCritical);
    // Next renewal: the earliest of contract ends and app renewal dates.
    const next = nextRenewal(s.contracts, now);
    let best: VendorSummary["renewal"] = next
      ? { label: next.contract.name, date: next.info.end, days: next.info.days, source: next.contract.name, noticeText: next.info.noticeBy ? next.info.text : null }
      : null;
    for (const app of s.apps) {
      if (!app.renewalDate) continue;
      const days = Math.ceil((app.renewalDate.getTime() - now.getTime()) / DAY);
      if (days < 0) continue;
      if (!best || days < best.days) best = { label: app.name, date: app.renewalDate, days, source: app.name, noticeText: null };
    }
    s.renewal = best;
    const ids = new Set(s.apps.map((a) => a.id));
    for (const group of over.groups) {
      const mine = group.tools.filter((t) => ids.has(t.id));
      const others = group.tools.filter((t) => !ids.has(t.id));
      if (!mine.length || !others.length) continue;
      for (const tool of mine) {
        const entry = s.overlapsWith.find((o) => o.app === tool.name);
        const names = others.map((o) => o.name);
        if (entry) entry.others = [...new Set([...entry.others, ...names])];
        else s.overlapsWith.push({ app: tool.name, others: names });
      }
    }
    if (s.share > 0.3 || s.critical.length >= 3) s.badges.push({ kind: "concentration", label: "High concentration" });
    if (s.overlapsWith.length) {
      const first = s.overlapsWith[0];
      s.badges.push({ kind: "overlap", label: `Overlap: ${first.app} ↔ ${first.others.slice(0, 2).join(", ")}` });
    }
    if (s.critical.length === 1 && s.apps.length === 1) s.badges.push({ kind: "single-critical", label: "Single critical app" });
  }
  return all.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
}

/** Apps with no vendor whose name matches a catalog product: "Slack -> Salesforce". */
export function knownVendorSuggestions(rows: readonly CatalogRow[], relationships: readonly Relationship[], tools: readonly CatalogTool[]) {
  const supplied = new Set(relationships.filter((r) => r.type === "supplied_by").map((r) => r.from_object_id));
  const out: { row: CatalogRow; vendor: string }[] = [];
  for (const row of rows) {
    if (row.vendor || supplied.has(row.id)) continue;
    const props = (row.object.properties ?? {}) as Record<string, unknown>;
    const tool = catalogToolFor(row.name, tools, typeof props.catalog_tool === "string" ? props.catalog_tool : undefined);
    if (tool?.vendor) out.push({ row, vendor: displayVendorName(tool.vendor) });
  }
  return out;
}

export function renewalTag(days: number): { text: string; tone: "red" | "amber" | null } {
  if (days <= 45) return { text: `${days} days`, tone: "red" };
  if (days <= 90) return { text: `${days} days`, tone: "amber" };
  return { text: "", tone: null };
}

export { renewalInfo };
