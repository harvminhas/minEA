import { TOOL_CATALOG as catalog } from "@/lib/catalog/tools-catalog";

export type ToolHosting = "saas" | "own" | "either";
export type ToolKind = "app" | "server";

export type ToolRecord = {
  name: string;
  aliases: string[];
  vendor: string;
  category: string;
  hosting: ToolHosting;
  kind: ToolKind;
  typicalAnnual: number | null;
  unit: string;
  hints?: string[];
};

export const TOOL_CATALOG = catalog as ToolRecord[];

export const SAMPLE_COMPANY = "Salesforce, QuickBooks, M365, AS400, Order Entry, EDI, Shopify, label printing";

export type MatchStatus = "matched" | "pick" | "weak" | "custom";

export type MatchItem = {
  input: string;
  status: MatchStatus;
  tool: ToolRecord | null;
  options: ToolRecord[];
  customBuilt: boolean;
};

export function normalizeTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function splitEntries(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of text.split(/[\n,]+/)) {
    const trimmed = part.trim();
    const key = normalizeTerm(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(trimmed);
  }
  return items;
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

function similarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function editDistance(left: string, right: string): number {
  if (Math.abs(left.length - right.length) > 2) return 99;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j]!;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + cost);
      previous = current;
    }
  }
  return row[right.length]!;
}

function namesOf(tool: ToolRecord): string[] {
  return [tool.name, ...tool.aliases].map(normalizeTerm).filter(Boolean);
}

function tierFor(input: string, tool: ToolRecord): "exact" | "token" | "fuzzy" | null {
  const names = namesOf(tool);
  if (names.includes(input)) return "exact";
  const tokens = input.split(" ").filter((token) => token.length >= 3);
  for (const name of names) {
    if (input.length >= 3 && (name.startsWith(input) || input.startsWith(name))) return "token";
    if (tokens.some((token) => name.split(" ").includes(token))) return "token";
  }
  const hintHit = (tool.hints ?? []).some((hint) => tokens.includes(normalizeTerm(hint)));
  const close = names.some((name) => similarity(input, name) >= 0.6 || editDistance(input, name) <= 2);
  if (hintHit || close) return "fuzzy";
  return null;
}

export function matchEntries(text: string): MatchItem[] {
  return splitEntries(text).map((input) => {
    const key = normalizeTerm(input);
    const hits = { exact: [] as ToolRecord[], token: [] as ToolRecord[], fuzzy: [] as ToolRecord[] };
    for (const tool of TOOL_CATALOG) {
      const tier = tierFor(key, tool);
      if (tier) hits[tier].push(tool);
    }
    const tier = hits.exact.length ? "exact" : hits.token.length ? "token" : hits.fuzzy.length ? "fuzzy" : null;
    const options = tier ? hits[tier] : [];
    if (!tier || options.length === 0) {
      return { input, status: "custom", tool: null, options: [], customBuilt: false };
    }
    if (options.length > 1) {
      return { input, status: "pick", tool: null, options, customBuilt: false };
    }
    if (tier === "fuzzy") {
      return { input, status: "weak", tool: options[0]!, options, customBuilt: false };
    }
    return { input, status: "matched", tool: options[0]!, options, customBuilt: false };
  });
}

export type HostingChoice = "saas" | "own" | "unknown";

export function defaultHosting(item: MatchItem): HostingChoice {
  const tool = item.tool;
  if (!tool || item.status === "custom") return "unknown";
  if (tool.hosting === "saas") return "saas";
  if (tool.hosting === "own") return "own";
  return "unknown";
}

export type HostingRow = {
  key: string;
  name: string;
  choice: HostingChoice;
  serverName: string;
};

export type HostingPlan = {
  servers: { key: string; name: string; where: string }[];
  links: { appKey: string; serverKey: string }[];
};

/** Several apps can name the same server. That is one server and one link each. */
export function planHosting(rows: HostingRow[], whereByServer: Record<string, string>): HostingPlan {
  const servers = new Map<string, { key: string; name: string; where: string }>();
  const links: { appKey: string; serverKey: string }[] = [];
  for (const row of rows) {
    if (row.choice !== "own") continue;
    const name = row.serverName.trim();
    if (!name) continue;
    const key = normalizeTerm(name);
    if (!servers.has(key)) servers.set(key, { key, name, where: (whereByServer[key] ?? "").trim() });
    links.push({ appKey: row.key, serverKey: key });
  }
  return { servers: [...servers.values()], links };
}
