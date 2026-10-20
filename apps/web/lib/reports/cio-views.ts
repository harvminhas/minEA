import { annualCost } from "@/lib/cost/service";
import { readCostLines } from "@/lib/cost/math";
import type { LandscapeEdge, LandscapeObject } from "@/lib/ai/landscape";

/**
 * Idle licences and overlapping tools: pure functions over catalog objects and relationships.
 * apps/api/app/ai/ask/cio_views.py mirrors this file; the shared fixture
 * (packages/types/src/fixtures/cio-views.fixture.json) keeps the two in step. Money is in whole cents.
 */

export const TOOL_TYPES = ["application", "cloud_service", "solution", "technical_capability"] as const;

export type IdleRow = {
  id: string;
  name: string;
  bought: number;
  inUse: number;
  idle: number;
  /** Yearly cost of one licence, cents; null when no cost is recorded. */
  perLicenceCents: number | null;
  wastedCents: number | null;
  owner: string;
  renewal: string | null;
};
export type IdleLicences = {
  rows: IdleRow[];
  /** Apps with a licence count but no in-use count yet. */
  missing: { id: string; name: string; bought: number }[];
  totals: { wastedCents: number; idle: number; bought: number };
};

export type OverlapTool = {
  id: string;
  name: string;
  type: string;
  annualCents: number | null;
  owner: string;
  users: number | null;
  renewal: string | null;
};
export type OverlapGroup = { id: string; name: string; tools: OverlapTool[]; savingsCents: number };
export type Overlaps = {
  groups: OverlapGroup[];
  /** Each dropped tool counted once, even when it overlaps on several capabilities. */
  savingsCents: number;
  /** Apps in the same category with no capability linked: a hint, not an overlap. */
  categoryHints: { category: string; tools: { id: string; name: string }[] }[];
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const roundHalfUp = (value: number) => Math.floor(value + 0.5);
const active = (object: LandscapeObject) => object.status !== "retired";

function count(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function ownerOf(object: LandscapeObject, byId: Map<string, LandscapeObject>): string {
  const team = object.owner_team_id ? byId.get(object.owner_team_id)?.name : "";
  const person = object.point_of_contact_id ? byId.get(object.point_of_contact_id)?.name : "";
  // Catalog objects carry the team and contact names; teams are not catalog records.
  const named = object as LandscapeObject & { owner_team_name?: string | null; point_of_contact_name?: string | null };
  return team || str(named.owner_team_name) || person || str(named.point_of_contact_name) || str(object.owner) || (object.owner_team_id || object.point_of_contact_id ? "Owner set" : "");
}

export function annualCents(properties: Record<string, unknown> | null | undefined): number | null {
  const run = annualCost(properties).run;
  return run != null && run > 0 ? roundHalfUp(run * 100) : null;
}

/** Per-user price × 12 from the first per-user cost line, else annual cost ÷ licences. */
export function perLicenceCents(properties: Record<string, unknown> | null | undefined, bought: number): number | null {
  const line = (readCostLines(properties) ?? []).find((item) => item?.calculation?.kind === "per_user");
  if (line && line.calculation.kind === "per_user") return Math.max(0, line.calculation.unit_price_monthly_cents) * 12;
  const annual = annualCents(properties);
  return annual != null && bought > 0 ? roundHalfUp(annual / bought) : null;
}

export function inUseCount(properties: Record<string, unknown> | null | undefined): number | null {
  return count(properties?.licences_in_use);
}

export function idleLicences(objects: readonly LandscapeObject[]): IdleLicences {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const rows: IdleRow[] = [];
  const missing: IdleLicences["missing"] = [];
  for (const object of objects) {
    if (object.type !== "application" || !active(object)) continue;
    const props = object.properties ?? {};
    const bought = count(props.licence_count);
    if (!bought) continue;
    const inUse = inUseCount(props);
    if (inUse == null) {
      missing.push({ id: object.id, name: object.name, bought });
      continue;
    }
    const idle = Math.max(0, bought - inUse);
    const per = perLicenceCents(props, bought);
    rows.push({
      id: object.id,
      name: object.name,
      bought,
      inUse,
      idle,
      perLicenceCents: per,
      wastedCents: per == null ? null : idle * per,
      owner: ownerOf(object, byId),
      renewal: str(props.contract_renewal) || null,
    });
  }
  rows.sort((a, b) => (b.wastedCents ?? -1) - (a.wastedCents ?? -1) || b.idle - a.idle || a.name.localeCompare(b.name));
  missing.sort((a, b) => b.bought - a.bought || a.name.localeCompare(b.name));
  return {
    rows,
    missing,
    totals: {
      wastedCents: rows.reduce((sum, row) => sum + (row.wastedCents ?? 0), 0),
      idle: rows.reduce((sum, row) => sum + row.idle, 0),
      bought: rows.reduce((sum, row) => sum + row.bought, 0),
    },
  };
}

export function overlaps(objects: readonly LandscapeObject[], relationships: readonly LandscapeEdge[]): Overlaps {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const tools = new Set<string>(TOOL_TYPES);
  const linked = new Set<string>();
  const groups: OverlapGroup[] = [];
  const targetsOf = new Map<string, string[]>();
  for (const edge of relationships) {
    if (edge.type !== "supported_by") continue;
    const from = byId.get(edge.from_object_id);
    const to = byId.get(edge.to_object_id);
    if (!from || !to || from.type !== "capability" || !tools.has(to.type)) continue;
    linked.add(to.id);
    if (!active(from) || !active(to)) continue;
    const list = targetsOf.get(from.id) ?? [];
    if (!list.includes(to.id)) list.push(to.id);
    targetsOf.set(from.id, list);
  }
  for (const [capId, ids] of targetsOf) {
    if (ids.length < 2) continue;
    const list = ids.map((id): OverlapTool => {
      const object = byId.get(id)!;
      const props = object.properties ?? {};
      return {
        id,
        name: object.name,
        type: object.type,
        annualCents: annualCents(props),
        owner: ownerOf(object, byId),
        users: inUseCount(props) ?? count(props.licence_count),
        renewal: str(props.contract_renewal) || null,
      };
    });
    list.sort((a, b) => (b.users ?? -1) - (a.users ?? -1) || (b.annualCents ?? -1) - (a.annualCents ?? -1) || a.name.localeCompare(b.name));
    groups.push({ id: capId, name: byId.get(capId)!.name, tools: list, savingsCents: list.slice(1).reduce((sum, tool) => sum + (tool.annualCents ?? 0), 0) });
  }
  groups.sort((a, b) => b.savingsCents - a.savingsCents || b.tools.length - a.tools.length || a.name.localeCompare(b.name));
  const kept = new Set(groups.map((group) => group.tools[0]!.id));
  const dropped = new Map<string, number>();
  for (const group of groups) for (const tool of group.tools.slice(1)) if (!kept.has(tool.id)) dropped.set(tool.id, tool.annualCents ?? 0);
  const byCategory = new Map<string, { id: string; name: string }[]>();
  for (const object of objects) {
    if (object.type !== "application" || !active(object) || linked.has(object.id)) continue;
    const category = str(object.properties?.category);
    if (!category || category === "Other") continue;
    byCategory.set(category, [...(byCategory.get(category) ?? []), { id: object.id, name: object.name }]);
  }
  const categoryHints = [...byCategory]
    .filter(([, list]) => list.length >= 2)
    .map(([category, list]) => ({ category, tools: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.tools.length - a.tools.length || a.category.localeCompare(b.category));
  return { groups, savingsCents: [...dropped.values()].reduce((sum, value) => sum + value, 0), categoryHints };
}

export function centsLabel(cents: number | null): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
