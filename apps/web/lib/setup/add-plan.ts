import type { CostLine } from "@/lib/cost/math";
import { splitAddList } from "@/lib/setup/add-intent";
import { defaultHosting, isSetupApp, matchEntries, normalizeTerm, planHosting, type HostingChoice, type MatchItem, type ToolKind, type ToolRecord } from "@/lib/setup/match-tools";

export type AddKind = "app" | "platform" | "server" | "location" | "capability" | "vendor";

const EDITION = new Set(["online", "cloud", "workplace"]);

/** Keep the catalog name. A name that is not a built-in domain is still stored, and can be changed later. */
export function categoryFields(value: string | null | undefined): { category?: string } {
  const trimmed = value?.trim() ?? "";
  return trimmed ? { category: trimmed } : {};
}

const PLATFORM_TYPE_BY_CATEGORY: Record<string, string> = {
  crm: "crm",
  "crm foundation": "crm",
  erp: "erp",
  itsm: "itsm",
  "low-code": "low_code",
  "low code": "low_code",
  "no-code": "low_code",
  bpm: "bpm",
  workflow: "bpm",
  "custom development": "custom_dev",
};

/** Catalog categories that match a platform type. Analytics, Infrastructure, and AI do not. */
export function platformTypeFromCategory(category: string | null | undefined): string | null {
  const key = (category ?? "").trim().toLowerCase();
  return PLATFORM_TYPE_BY_CATEGORY[key] ?? null;
}

/** An exact catalog platform becomes a cloud service. Typed text and app tools stay applications. */
export function setupCreate(item: {
  input: string;
  status: MatchItem["status"];
  tool: ToolRecord | null;
  customBuilt?: boolean;
  yearly?: string;
}): { type: "application" | "model" | "cloud_service"; name: string; properties: Record<string, unknown> } | null {
  if (item.tool?.kind === "server") {
    const named = item.status === "matched" ? item.tool : null;
    return {
      type: "model",
      name: named?.name || item.input,
      properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" },
    };
  }
  const matched = item.status === "matched" ? item.tool : null;
  if (matched?.kind === "platform") {
    const hosting = matched.hosting === "saas" || matched.hosting === "paas" ? matched.hosting : matched.hosting === "own" ? "self_hosted" : undefined;
    const platformType = platformTypeFromCategory(matched.category);
    return {
      type: "cloud_service",
      name: matched.name,
      properties: {
        ...(matched.vendor ? { vendor: matched.vendor } : {}),
        ...categoryFields(matched.category),
        catalog_tool: normalizeTerm(matched.name),
        ...(hosting ? { hosting_model: hosting } : {}),
        ...(platformType ? { platform_type: platformType } : {}),
      },
    };
  }
  if (!isSetupApp(item)) return null;
  const yearly = Number(item.yearly);
  return {
    type: "application",
    name: matched?.name || item.input,
    properties: {
      ...(matched?.vendor ? { vendor: matched.vendor } : {}),
      ...(matched ? { catalog_tool: normalizeTerm(matched.name) } : {}),
      ...categoryFields(matched?.category),
      ...(item.customBuilt ? { is_custom_built: true } : {}),
      ...(matched && Number.isFinite(yearly) && yearly > 0 ? { cost_lines: [typicalLine(yearly, matched.vendor)] } : {}),
    },
  };
}

export type EstateItem = {
  id: string;
  type: string;
  name: string;
  owner: string;
  cost: string;
  lifecycle: string;
  category: string;
  catalogTool: string;
  vendor: string;
  renewal: string;
};

export type AddRow = {
  key: string;
  input: string;
  name: string;
  status: MatchItem["status"];
  tool: ToolRecord | null;
  options: ToolRecord[];
  customBuilt: boolean;
  kind: AddKind;
  choice: HostingChoice;
  existing: EstateItem | null;
  hint: string | null;
};

export function objectTypeFor(kind: AddKind): string {
  if (kind === "app") return "application";
  if (kind === "platform") return "cloud_service";
  if (kind === "server") return "model";
  if (kind === "location") return "location";
  if (kind === "capability") return "capability";
  return "external_party";
}

export function kindLabel(kind: AddKind, count: number): string {
  const word = kind === "app" ? "app" : kind === "platform" ? "platform" : kind === "server" ? "server" : kind === "location" ? "location" : kind === "capability" ? "capability" : "vendor";
  if (count === 1) return word;
  if (word === "app") return "apps";
  if (word === "capability") return "capabilities";
  return `${word}s`;
}

/** Lowercase, strip punctuation, drop edition words such as online, cloud, workplace. */
export function dedupeKey(value: string): string {
  return normalizeTerm(value)
    .split(" ")
    .filter((token) => token && !EDITION.has(token))
    .join(" ");
}

export function resolveKind(_item: MatchItem, preset: AddKind): AddKind {
  return preset;
}

/** Two typed names for one catalog entry become one row. */
export function collapseMatches(items: MatchItem[]): MatchItem[] {
  const seen = new Set<string>();
  const out: MatchItem[] = [];
  for (const item of items) {
    const id = item.tool ? dedupeKey(item.tool.name) : dedupeKey(item.input);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

export function findExisting(item: MatchItem, kind: AddKind, estate: EstateItem[]): EstateItem | null {
  const types = kind === "app" ? new Set(["application", "cloud_service"]) : new Set([objectTypeFor(kind)]);
  const keys = new Set<string>([dedupeKey(item.input)]);
  if (item.tool) {
    keys.add(dedupeKey(item.tool.name));
    for (const alias of item.tool.aliases) keys.add(dedupeKey(alias));
  }
  const toolKey = item.tool ? dedupeKey(item.tool.name) : "";
  return (
    estate.find((record) => {
      if (!types.has(record.type)) return false;
      if (toolKey && record.catalogTool && dedupeKey(record.catalogTool) === toolKey) return true;
      return keys.has(dedupeKey(record.name));
    }) ?? null
  );
}

export function categoryHint(tool: ToolRecord | null, estate: EstateItem[]): string | null {
  if (!tool || tool.kind === "server") return null;
  const category = tool.category.trim().toLowerCase();
  if (!category) return null;
  const match = estate.find((item) => {
    const theirs = item.category.trim().toLowerCase();
    return item.type === "application" && theirs.length > 0 && theirs === category && dedupeKey(item.name) !== dedupeKey(tool.name);
  });
  if (!match) return null;
  return `${tool.name} is the same kind of app as ${match.name}. Is one replacing the other?`;
}

const CATALOG_KIND: Partial<Record<AddKind, ToolKind>> = {
  app: "app",
  platform: "platform",
  server: "server",
};

function blankMatch(input: string): MatchItem {
  return { input, status: "custom", tool: null, options: [], customBuilt: false };
}

/** Locations and vendors keep the typed name. Apps, platforms, and servers match only that catalog kind. */
function matchesFor(text: string, preset: AddKind): MatchItem[] {
  const kind = CATALOG_KIND[preset];
  return splitAddList(text).flatMap((item) => (kind ? matchEntries(item, kind) : [blankMatch(item)]));
}

export function prepareRows(text: string, preset: AddKind, estate: EstateItem[]): AddRow[] {
  const matched = matchesFor(text, preset);
  return collapseMatches(matched).map((item) => {
    const kind = resolveKind(item, preset);
    const existing = findExisting(item, kind, estate);
    const tool = item.status === "matched" || item.status === "weak" ? item.tool : item.tool;
    return {
      key: item.tool ? dedupeKey(item.tool.name) : dedupeKey(item.input),
      input: item.input,
      name: item.status === "matched" && item.tool ? item.tool.name : item.input,
      status: item.status,
      tool: item.tool,
      options: item.options,
      customBuilt: item.customBuilt,
      kind,
      choice: defaultHosting(item),
      existing,
      hint: existing ? null : categoryHint(tool, estate),
    };
  });
}

/** Apps and platforms that are all SaaS skip the hosting step. Servers, locations, and vendors never get it. */
export function saasSkipCount(rows: AddRow[]): number | null {
  const hosted = rows.filter((row) => row.kind === "app" || row.kind === "platform");
  if (hosted.length === 0) return 0;
  if (hosted.every((row) => row.choice === "saas")) return hosted.length;
  return null;
}

export function addButtonLabel(creates: { kind: AddKind }[]): string {
  if (creates.length === 0) return "Nothing new to add";
  if (creates.length === 1) return `Add ${kindLabel(creates[0]!.kind, 1)}`;
  const kinds = new Set(creates.map((item) => item.kind));
  if (kinds.size === 1) return `Add ${creates.length} ${kindLabel(creates[0]!.kind, creates.length)}`;
  return `Add ${creates.length}`;
}

export function addedSentence(created: { name: string; kind: AddKind }[], keptNames: string[]): string {
  const kept =
    keptNames.length === 0
      ? ""
      : keptNames.length === 1
        ? ` ${keptNames[0]} was already in your map.`
        : ` ${keptNames.join(", ")} were already in your map.`;
  if (created.length === 0) return kept.trim();
  const kinds = new Set(created.map((item) => item.kind));
  const word = kinds.size === 1 ? kindLabel(created[0]!.kind, created.length) : "items";
  return `Added ${created.length} ${word}: ${created.map((item) => item.name).join(", ")}.${kept}`;
}

export function homeSentence(apps: { choice: HostingChoice; linked: boolean }[]): string {
  if (apps.length === 0) return "";
  const homeless = apps.filter((app) => app.choice === "unknown" || (app.choice === "own" && !app.linked)).length;
  if (homeless === 0 && apps.every((app) => app.choice === "saas")) {
    if (apps.length === 1) return "This one is SaaS, so it doesn't need a home.";
    if (apps.length === 2) return "Both are SaaS, so neither needs a home.";
    return `All ${apps.length} are SaaS, so none need a home.`;
  }
  if (homeless === 1) return "1 still needs a home.";
  if (homeless > 1) return `${homeless} still need a home.`;
  return "";
}

export type TodoRow = {
  name: string;
  kind: AddKind;
  kept: boolean;
  updating: boolean;
  owner: string;
  renewal: string;
  choice: HostingChoice;
  hint: string | null;
};

/** One line per new item that still has a gap, plus one line per same-category hint. */
export function todoLines(rows: TodoRow[]): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    if (row.kept || row.updating) continue;
    const gaps: string[] = [];
    if (row.kind !== "location" && row.kind !== "vendor" && !row.owner) gaps.push("no owner");
    if (row.kind !== "location" && row.kind !== "vendor" && !row.renewal) gaps.push("no renewal date");
    if ((row.kind === "app" || row.kind === "platform") && row.choice === "unknown") gaps.push("no home");
    if (gaps.length) lines.push(`${row.name} still has ${gaps.join(", ")}`);
    if (row.hint) lines.push(row.hint);
  }
  return lines;
}

export type BatchCreate = {
  key: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  owner?: string;
  ownerTeam?: string;
  ownerName?: string;
};

export type BatchUpdate = {
  id: string;
  properties?: Record<string, unknown>;
  owner?: string;
  ownerTeam?: string;
  ownerName?: string;
};

export type BatchRel = {
  type: string;
  fromKey?: string;
  toKey?: string;
  fromId?: string;
  toId?: string;
  fromType: string;
  toType: string;
};

export type PlanInput = AddRow & {
  keep: boolean;
  serverName: string;
  where: string;
  ownerTeam: string;
  ownerName: string;
  renewal: string;
  yearly: string;
  domainId: string;
};

export function planInputs(rows: AddRow[]): PlanInput[] {
  return rows.map((row) => ({
    ...row,
    keep: Boolean(row.existing),
    serverName: "",
    where: "",
    ownerTeam: "",
    ownerName: "",
    renewal: "",
    yearly: row.status === "matched" && row.tool?.typicalAnnual ? String(row.tool.typicalAnnual) : "",
    domainId: "",
  }));
}

function typicalLine(annual: number, vendor: string): CostLine {
  const now = new Date().toISOString();
  return {
    id: `typical-${normalizeTerm(vendor) || "cost"}`,
    type: "subscription",
    amount_cents: Math.round(annual * 100),
    frequency: "annual",
    calculation: { kind: "flat" },
    vendor: vendor || null,
    source: "estimate",
    notes: "typical",
    created_at: now,
    created_by: "add",
    updated_at: now,
    updated_by: "add",
  };
}

function createProperties(row: PlanInput): Record<string, unknown> {
  const tool = row.status === "matched" ? row.tool : null;
  const yearly = Number(row.yearly);
  const catalogTool = tool ? normalizeTerm(tool.name) : undefined;
  if (row.kind === "server") {
    return {
      runtime_kind: "physical_server",
      compute_runtime_kind: "on_prem",
      ...(catalogTool ? { catalog_tool: catalogTool } : {}),
    };
  }
  if (row.kind === "location") return { location_type: "other" };
  if (row.kind === "vendor") return {};
  if (row.kind === "capability") return { domain_id: row.domainId };
  const properties: Record<string, unknown> = {};
  if (tool?.vendor) properties.vendor = tool.vendor;
  Object.assign(properties, categoryFields(tool?.category));
  if (catalogTool) properties.catalog_tool = catalogTool;
  if (row.customBuilt) properties.is_custom_built = true;
  if (row.kind === "platform") {
    if (row.choice === "saas" || row.choice === "paas" || row.choice === "self_hosted") properties.hosting_model = row.choice;
    const platformType = platformTypeFromCategory(tool?.category);
    if (platformType) properties.platform_type = platformType;
  } else if (row.choice === "saas") {
    properties.hosting_model = "saas";
  } else if (row.kind === "app" && row.choice === "own") {
    properties.hosting_model = "on_premise";
  }
  if (tool && Number.isFinite(yearly) && yearly > 0) properties.cost_lines = [typicalLine(yearly, tool.vendor)];
  if (row.renewal) properties.contract_renewal = row.renewal;
  return properties;
}

/** Update writes only fields the record does not already have. */
export function emptyFill(existing: EstateItem, row: PlanInput): BatchUpdate | null {
  const properties: Record<string, unknown> = {};
  const tool = row.status === "matched" ? row.tool : null;
  if (!existing.vendor && tool?.vendor) properties.vendor = tool.vendor;
  if (!existing.category) Object.assign(properties, categoryFields(tool?.category));
  if (!existing.catalogTool && tool) properties.catalog_tool = normalizeTerm(tool.name);
  if (!existing.renewal && row.renewal) properties.contract_renewal = row.renewal;
  const yearly = Number(row.yearly);
  if (!existing.cost && tool && Number.isFinite(yearly) && yearly > 0) {
    properties.cost_lines = [typicalLine(yearly, tool.vendor)];
  }
  const update: BatchUpdate = { id: existing.id };
  if (Object.keys(properties).length) update.properties = properties;
  if (!existing.owner && row.ownerTeam) {
    update.owner = row.ownerTeam;
    update.ownerTeam = row.ownerTeam;
  }
  if (!existing.owner && row.ownerName) update.ownerName = row.ownerName;
  if (!update.properties && !update.owner && !update.ownerName) return null;
  return update;
}

export function buildBatch(rows: PlanInput[], estate: EstateItem[]): { creates: BatchCreate[]; updates: BatchUpdate[]; relationships: BatchRel[] } {
  const creates: BatchCreate[] = [];
  const updates: BatchUpdate[] = [];
  const active = rows.filter((row) => !(row.existing && row.keep));
  for (const row of active) {
    if (row.existing) {
      const update = emptyFill(row.existing, row);
      if (update) updates.push(update);
      continue;
    }
    const properties = createProperties(row);
    creates.push({
      key: row.key,
      type: objectTypeFor(row.kind),
      name: row.name,
      properties,
      ...(row.ownerTeam ? { owner: row.ownerTeam, ownerTeam: row.ownerTeam } : {}),
      ...(row.ownerName ? { ownerName: row.ownerName } : {}),
    });
  }

  const hostingRows = active
    .filter((row) => !row.existing && (row.kind === "app" || row.kind === "platform") && row.choice === "own" && row.serverName.trim())
    .map((row) => ({ key: row.key, name: row.name, choice: row.choice, serverName: row.serverName }));
  const whereByServer: Record<string, string> = {};
  for (const row of active) {
    if (row.choice !== "own" || !row.serverName.trim()) continue;
    whereByServer[dedupeKey(row.serverName)] = row.where;
  }
  const planned = planHosting(hostingRows, whereByServer);
  const relationships: BatchRel[] = [];
  for (const server of planned.servers) {
    const existing = estate.find((item) => item.type === "model" && dedupeKey(item.name) === server.key);
    if (!existing && !creates.some((item) => item.key === server.key)) {
      creates.push({
        key: server.key,
        type: "model",
        name: server.name,
        properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" },
      });
    }
    if (server.where) {
      const placeKey = `place:${server.key}`;
      creates.push({
        key: placeKey,
        type: "location",
        name: server.where,
        properties: { location_type: "other" },
      });
      relationships.push({
        type: "located_at",
        fromKey: existing ? undefined : server.key,
        fromId: existing?.id,
        fromType: "model",
        toKey: placeKey,
        toType: "location",
      });
    }
  }
  for (const link of planned.links) {
    const server = planned.servers.find((item) => item.key === link.serverKey);
    const existing = server ? estate.find((item) => item.type === "model" && dedupeKey(item.name) === server.key) : undefined;
    relationships.push({
      type: "runs_on",
      fromKey: link.appKey,
      fromType: "application",
      toKey: existing ? undefined : link.serverKey,
      toId: existing?.id,
      toType: "model",
    });
  }
  return { creates, updates, relationships };
}
