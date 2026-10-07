import { TOOL_CATALOG as catalog } from "@/lib/catalog/tools-catalog";

export type ToolHosting = "saas" | "paas" | "own" | "either";
export type ToolKind = "app" | "server" | "platform";

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

/** A bare number such as 365 is not a name. It counts only beside another word from that name. */
function tokenHit(input: string, name: string): boolean {
  const inputTokens = input.split(" ").filter(Boolean);
  const nameTokens = name.split(" ").filter(Boolean);
  const nameSet = new Set(nameTokens);
  const words = inputTokens.filter((token) => token.length >= 3 && !/^\d+$/.test(token));
  if (words.length > 0) return words.every((token) => nameSet.has(token));
  const numbers = inputTokens.filter((token) => /^\d+$/.test(token) && token.length >= 3);
  if (!numbers.some((token) => nameSet.has(token) || name.replace(/ /g, "").includes(token))) return false;
  const letters = inputTokens.filter((token) => !/^\d+$/.test(token)).join("");
  if (letters.length < 2) return false;
  const compact = name.replace(/ /g, "");
  return editDistance(`${letters}${numbers[0]}`, compact) <= 1 || nameTokens.some((word) => word.startsWith(letters));
}

function tierFor(input: string, tool: ToolRecord): "exact" | "token" | "fuzzy" | null {
  const names = namesOf(tool);
  if (names.includes(input)) return "exact";
  const tokens = input.split(" ").filter((token) => token.length >= 3 && !/^\d+$/.test(token));
  for (const name of names) {
    if (input.length >= 3 && (name.startsWith(input) || input.startsWith(name))) return "token";
    if (tokenHit(input, name)) return "token";
  }
  const hintHit = (tool.hints ?? []).some((hint) => tokens.includes(normalizeTerm(hint)));
  const close = names.some((name) => similarity(input, name) >= 0.6 || editDistance(input, name) <= 2);
  if (hintHit || close) return "fuzzy";
  return null;
}

/** A catalog name or alias equal to the typed text. Token and fuzzy hits do not count. */
export function exactCatalogTool(text: string): ToolRecord | null {
  const key = normalizeTerm(text);
  if (!key) return null;
  const hits = TOOL_CATALOG.filter((tool) =>
    [tool.name, ...tool.aliases].some((name) => normalizeTerm(name) === key),
  );
  return hits.length === 1 ? hits[0]! : null;
}

/** Setup lists apps and servers. Platform catalog names stay out of that match. */
export const SETUP_MATCH_KINDS: readonly ToolKind[] = ["app", "server"];

export function matchEntries(text: string, kind?: ToolKind | readonly ToolKind[]): MatchItem[] {
  const kinds = kind == null ? null : new Set<ToolKind>(typeof kind === "string" ? [kind] : kind);
  const tools = kinds ? TOOL_CATALOG.filter((tool) => kinds.has(tool.kind)) : TOOL_CATALOG;
  const exactOnly = kinds != null && [...kinds].every((item) => item === "server" || item === "platform");
  return splitEntries(text).map((input) => {
    const key = normalizeTerm(input);
    const hits = { exact: [] as ToolRecord[], token: [] as ToolRecord[], fuzzy: [] as ToolRecord[] };
    for (const tool of tools) {
      const tier = tierFor(key, tool);
      if (tier) hits[tier].push(tool);
    }
    if (exactOnly) {
      hits.token = [];
      hits.fuzzy = [];
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

export function setupMatch(text: string): MatchItem[] {
  return matchEntries(text, SETUP_MATCH_KINDS).map((item) => {
    if (item.tool) return item;
    const platform = exactCatalogTool(item.input);
    if (platform?.kind !== "platform") return item;
    return { ...item, status: "matched" as const, tool: platform, options: [platform] };
  });
}

/** Setup creates an application for an app tool or typed text. A catalog platform is neither. */
export function isSetupApp(item: { input: string; tool: { kind: ToolKind } | null }): boolean {
  if (item.tool?.kind === "server" || item.tool?.kind === "platform") return false;
  return exactCatalogTool(item.input)?.kind !== "platform";
}

export type HostingChoice = "saas" | "paas" | "self_hosted" | "own" | "unknown";

export function choiceForTool(tool: { hosting: ToolHosting } | null | undefined): HostingChoice {
  if (!tool) return "unknown";
  if (tool.hosting === "saas") return "saas";
  if (tool.hosting === "paas") return "paas";
  if (tool.hosting === "own") return "own";
  return "unknown";
}

export function defaultHosting(item: MatchItem): HostingChoice {
  if (!item.tool || item.status === "custom") return "unknown";
  return choiceForTool(item.tool);
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
