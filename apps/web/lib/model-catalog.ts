import type { MinEAObject } from "@minea/types";
import { annualCost, vendorAmounts } from "@/lib/cost/service";
import { PLATFORM_VENDOR_LABEL } from "@/lib/platform-utils";
import { RUNTIME_COST_MODEL_LABEL } from "@/lib/runtime-utils";

export type CatalogKind = "application" | "runtime" | "platform";

export type CatalogMissing = {
  owner: boolean;
  vendor: boolean;
  cost: boolean;
  renewal: boolean;
  lifecycle: boolean;
  criticality: boolean;
};

export type CatalogRow = {
  id: string;
  object: MinEAObject;
  kind: CatalogKind;
  name: string;
  typeLabel: string;
  subtitle: string;
  ownerTeam: string;
  ownerPerson: string;
  vendor: string;
  vendorKey: string;
  annualCostLabel: string;
  annualCostNumber: number | null;
  renewalLabel: string;
  renewalDate: Date | null;
  renewalSoon: boolean;
  lifecycle: string;
  lifecycleLabel: string;
  criticality: string;
  criticalityLabel: string;
  costModelLabel: string;
  hostingLabel: string;
  slaLabel: string;
  suggestion: string | null;
  missing: CatalogMissing;
  missingCount: number;
};

const HOSTING_NOT_VENDOR = new Set([
  "on_premise",
  "on_prem",
  "self_hosted",
  "public_cloud",
  "private_cloud",
  "hybrid",
  "saas",
  "paas",
  "cloud",
  "other",
]);

const LIFECYCLE_LABEL: Record<string, string> = {
  planned: "Planned",
  pilot: "Pilot",
  under_evaluation: "Planned",
  active: "Active",
  retiring: "Retiring",
  deprecated: "Retiring",
  end_of_life: "End of life",
  retired: "End of life",
};

const CRITICALITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  tier1: "Critical",
  critical: "Critical",
};

export function moneyLabel(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function vendorSuggestion(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("as400") || n.includes("as/400") || n.includes("iseries") || n.includes("i series")) {
    return "IBM";
  }
  return null;
}

export function displayVendor(raw?: string | null): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed || HOSTING_NOT_VENDOR.has(trimmed)) return "";
  return PLATFORM_VENDOR_LABEL[trimmed] ?? trimmed;
}

type Props = Record<string, unknown>;

function str(props: Props, key: string): string {
  const value = props[key];
  return typeof value === "string" ? value : "";
}

export function rowFromObject(object: MinEAObject): CatalogRow | null {
  const props = (object.properties ?? {}) as Props;
  let kind: CatalogKind | null = null;
  if (object.type === "application" || object.type === "solution" || object.type === "technical_capability") {
    kind = "application";
  } else if (object.type === "model") {
    kind = "runtime";
  } else if (object.type === "cloud_service") {
    kind = "platform";
  }
  if (!kind) return null;

  const hosting = str(props, "hosting_model");
  const runtimeKind = str(props, "compute_runtime_kind");
  const region = str(props, "region");
  const category = str(props, "category");
  const name = object.name?.trim() || "Untitled";

  let typeLabel = "Application";
  if (kind === "application") {
    typeLabel = object.type === "solution" ? "Solution" : object.type === "technical_capability" ? "Capability" : "Application";
  } else if (/network|firewall/i.test(name)) {
    typeLabel = "Network";
  } else if (runtimeKind === "on_prem" || hosting === "on_premise" || hosting === "self_hosted") {
    typeLabel = "On-prem server";
  } else if (hosting === "saas") {
    typeLabel = "SaaS platform";
  } else if (hosting === "public_cloud" || hosting === "private_cloud" || hosting === "cloud" || hosting === "paas" || hosting === "hybrid") {
    typeLabel = "Cloud";
  } else if (kind === "platform") {
    typeLabel = "SaaS platform";
  } else if (kind === "runtime") {
    typeLabel = "Server";
  } else {
    typeLabel = "Cloud";
  }

  const subtitle =
    region ||
    (kind === "application" ? category.replace(/_/g, " ") : "") ||
    "";

  const ownerTeam = object.owner_team_name?.trim() || "";
  const ownerPerson = object.point_of_contact_name?.trim() || (!ownerTeam ? object.owner?.trim() || "" : "");
  const vendor = displayVendor(str(props, "vendor"));
  const costModel = str(props, "cost_model");
  const cost = annualCost(props);
  const numeric = cost.run;
  const costModelLabel = RUNTIME_COST_MODEL_LABEL[costModel] ?? "";
  const annualCostLabel = cost.label;
  const costMissing = cost.missing;

  const renewalRaw = (kind === "runtime" ? str(props, "commitment_ends") : str(props, "contract_renewal")).trim();
  const renewalDate = parseIsoDate(renewalRaw);
  const renewalNote = renewalRaw.toLowerCase();
  const renewalKnown = Boolean(renewalDate) || renewalNote === "monthly" || renewalNote === "no contract" || renewalNote === "none";
  const renewalLabel = renewalDate ? formatDate(renewalDate) : renewalRaw;
  const soon = renewalDate != null && daysUntil(renewalDate) <= 90;

  const lifecycle =
    kind === "application" ? object.status || str(props, "lifecycle") : str(props, "lifecycle") || object.status || "";
  const criticality = str(props, "criticality");

  const missing: CatalogMissing = {
    owner: !ownerTeam && !ownerPerson,
    vendor: !vendor,
    cost: costMissing,
    renewal: !renewalKnown,
    lifecycle: !lifecycle,
    criticality: !criticality,
  };
  const missingCount = Object.values(missing).filter(Boolean).length;

  return {
    id: object.id,
    object,
    kind,
    name,
    typeLabel,
    subtitle,
    ownerTeam,
    ownerPerson,
    vendor,
    vendorKey: vendor.toLowerCase(),
    annualCostLabel,
    annualCostNumber: numeric,
    renewalLabel,
    renewalDate,
    renewalSoon: soon,
    lifecycle,
    lifecycleLabel: LIFECYCLE_LABEL[lifecycle] ?? (lifecycle ? lifecycle.replace(/_/g, " ") : ""),
    criticality,
    criticalityLabel: CRITICALITY_LABEL[criticality] ?? "",
    costModelLabel,
    hostingLabel: hosting.replace(/_/g, " "),
    slaLabel: str(props, "sla_target").replace(/_/g, "."),
    suggestion: vendor ? null : vendorSuggestion(name),
    missing,
    missingCount,
  };
}

export function catalogStats(rows: CatalogRow[]) {
  const tracked = rows;
  const spend = tracked.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0);
  const vendors = new Set(tracked.map((row) => row.vendorKey).filter(Boolean));
  const cells = tracked.length * 6;
  const missing = tracked.reduce((sum, row) => sum + row.missingCount, 0);
  const filled = cells - missing;
  const renewals = tracked.filter((row) => row.renewalSoon);
  return {
    systems: tracked.filter((row) => row.kind === "application").length,
    infrastructure: tracked.filter((row) => row.kind !== "application").length,
    spend,
    vendorCount: vendors.size,
    completeness: cells ? Math.round((filled / cells) * 100) : 0,
    missing,
    renewals,
    renewalSpend: renewals.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0),
    noOwner: tracked.filter((row) => row.missing.owner),
    endOfLife: tracked.filter((row) =>
      ["retiring", "deprecated", "end_of_life", "retired"].includes(row.lifecycle)
    ),
  };
}

/** Vendor names the sidebar counts. These are names on records, not external_party rows. */
export function catalogVendorNames(rows: CatalogRow[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    if (!row.vendorKey || !row.vendor) continue;
    if (!byKey.has(row.vendorKey)) byKey.set(row.vendorKey, row.vendor);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

const PANEL_TYPE_LABEL: Record<string, string> = {
  location: "Location",
  capability: "Capability",
  external_party: "Vendor",
  agent: "AI agent",
  ai_model: "AI model",
};

/** A panel row for a type the catalog tables do not list. */
export function rowForPanel(object: MinEAObject): CatalogRow | null {
  const listed = rowFromObject(object);
  if (listed) return listed;
  const typeLabel = PANEL_TYPE_LABEL[object.type];
  if (!typeLabel) return null;
  const ownerTeam = object.owner_team_name?.trim() || "";
  const ownerPerson = object.point_of_contact_name?.trim() || (!ownerTeam ? object.owner?.trim() || "" : "");
  const missing: CatalogMissing = {
    owner: !ownerTeam && !ownerPerson,
    vendor: false,
    cost: false,
    renewal: false,
    lifecycle: false,
    criticality: false,
  };
  const priced = object.type === "agent" || object.type === "ai_model" ? annualCost(object.properties) : null;
  return {
    id: object.id,
    object,
    kind: "runtime",
    name: object.name?.trim() || "Untitled",
    typeLabel,
    subtitle: "",
    ownerTeam,
    ownerPerson,
    vendor: "",
    vendorKey: "",
    annualCostLabel: priced?.label ?? "",
    annualCostNumber: priced?.run ?? null,
    renewalLabel: "",
    renewalDate: null,
    renewalSoon: false,
    lifecycle: "",
    lifecycleLabel: "",
    criticality: "",
    criticalityLabel: "",
    costModelLabel: "",
    hostingLabel: "",
    slaLabel: "",
    suggestion: null,
    missing,
    missingCount: missing.owner ? 1 : 0,
  };
}

/** A panel row for a vendor name that has no vendor object yet. */
export function vendorPanelRow(id: string, name: string): CatalogRow {
  const row = rowForPanel({
    id,
    workspace_id: "",
    org_id: "",
    type: "external_party",
    name,
    tags: [],
    properties: {},
    created_at: "1970-01-01T00:00:00Z",
    updated_at: "1970-01-01T00:00:00Z",
  });
  if (!row) throw new Error("A vendor panel row needs a name");
  return row;
}

type VendorBucket = {
  vendor: string;
  annual: number;
  items: CatalogRow[];
  renewal: CatalogRow | null;
  owners: Set<string>;
};

function addVendor(map: Map<string, VendorBucket>, name: string, amount: number, row: CatalogRow) {
  const key = name.toLowerCase();
  const current = map.get(key) ?? {
    vendor: name,
    annual: 0,
    items: [],
    renewal: null,
    owners: new Set<string>(),
  };
  current.annual += amount;
  if (!current.items.some((item) => item.id === row.id)) current.items.push(row);
  if (row.ownerTeam) current.owners.add(row.ownerTeam);
  if (row.renewalDate && (!current.renewal?.renewalDate || row.renewalDate < current.renewal.renewalDate)) {
    current.renewal = row;
  }
  map.set(key, current);
}

export function vendorRollup(rows: CatalogRow[]) {
  const map = new Map<string, VendorBucket>();
  for (const row of rows) {
    const amounts = vendorAmounts((row.object.properties ?? {}) as Record<string, unknown>, row.vendor);
    const seen = new Set<string>();
    for (const amount of amounts) {
      const name = displayVendor(amount.vendor);
      if (!name) continue;
      seen.add(name.toLowerCase());
      addVendor(map, name, amount.dollars, row);
    }
    if (row.vendor && !seen.has(row.vendorKey)) addVendor(map, row.vendor, 0, row);
  }
  return [...map.values()].sort((a, b) => b.annual - a.annual || a.vendor.localeCompare(b.vendor));
}

/** Vendor names already used on an application, infrastructure item, or cost line. */
export function knownVendors(rows: CatalogRow[]): string[] {
  return vendorRollup(rows)
    .map((vendor) => vendor.vendor)
    .sort((a, b) => a.localeCompare(b));
}
