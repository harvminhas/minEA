import { TOOL_CATALOG, type ToolRecord } from "@/lib/setup/match-tools";

/**
 * The bundled tools.json is the fallback. When the API serves the platform-admin-edited
 * catalogue (GET /catalog/tools), its entries replace the bundled ones in place, so every
 * matcher (setup, Ask, Applications) sees the same list. Kept in localStorage for the next load.
 */
const STORAGE_KEY = "bubomap.toolCatalog.v1";
const BUNDLED = TOOL_CATALOG.slice();
let applied: string | null = null;

const HOSTINGS = new Set(["saas", "paas", "own", "either", "desktop"]);
const KINDS = new Set(["app", "platform", "server"]);

export function validTools(raw: unknown): ToolRecord[] | null {
  if (!Array.isArray(raw) || raw.length < 10) return null;
  const tools: ToolRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const tool = item as ToolRecord;
    if (typeof tool.name !== "string" || !Array.isArray(tool.aliases) || !HOSTINGS.has(tool.hosting) || !KINDS.has(tool.kind)) return null;
    tools.push({ ...tool, typicalAnnual: typeof tool.typicalAnnual === "number" ? tool.typicalAnnual : null, unit: tool.unit || "year", vendor: tool.vendor || "", category: tool.category || "" });
  }
  return tools;
}

/** Swap the live list in. Returns false (bundled list kept) when the payload doesn't look right. */
export function applyCatalog(raw: unknown, version: string): boolean {
  const tools = validTools(raw);
  if (!tools) return false;
  if (applied === version) return true;
  TOOL_CATALOG.splice(0, TOOL_CATALOG.length, ...tools);
  applied = version;
  return true;
}

export function resetToBundled(): void {
  TOOL_CATALOG.splice(0, TOOL_CATALOG.length, ...BUNDLED);
  applied = null;
}

export function catalogVersion(): string | null {
  return applied;
}

let inflight: Promise<void> | null = null;

/** Once per tab (or again with force after an admin edit). Failures keep whatever list is in use. */
export function refreshLiveCatalog(fetchTools: () => Promise<{ version: string; tools: unknown }>, force = false): Promise<void> {
  if (inflight && !force) return inflight;
  if (!force && typeof window !== "undefined" && !applied) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (stored?.version) applyCatalog(stored.tools, stored.version);
    } catch {
      /* ignore a bad cache */
    }
  }
  inflight = fetchTools()
    .then(({ version, tools }) => {
      if (applyCatalog(tools, version) && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version, tools }));
        } catch {
          /* storage full: fine */
        }
      }
    })
    .catch(() => undefined);
  return inflight;
}
