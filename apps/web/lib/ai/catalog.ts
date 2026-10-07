import { AI_FEATURE_CATALOG, AI_FEATURE_TYPES, type AiCatalogEntry } from "@minea/types";
import { normalizeTerm } from "@/lib/setup/match-tools";

type CatalogHost = { type: string; name: string; status?: string | null; properties?: Record<string, unknown> | null };

const HOST_TYPES = new Set<string>(AI_FEATURE_TYPES);

export function isAiFeatureHost(object: CatalogHost): boolean {
  if (!HOST_TYPES.has(object.type)) return false;
  if (object.status === "retired") return false;
  return object.properties?.lifecycle !== "end_of_life";
}

function matchesAlias(name: string, alias: string): boolean {
  const term = normalizeTerm(alias);
  return term !== "" && (name === term || name.startsWith(`${term} `));
}

/** Catalog entries that apply to this app or platform (advisory; no server lookup). */
export function catalogEntriesFor(object: CatalogHost): AiCatalogEntry[] {
  if (!isAiFeatureHost(object)) return [];
  const tool = object.properties?.catalog_tool;
  const toolTerm = typeof tool === "string" ? normalizeTerm(tool) : "";
  const name = normalizeTerm(object.name ?? "");
  return AI_FEATURE_CATALOG.filter((entry) => {
    if (toolTerm && entry.tool && normalizeTerm(entry.tool) === toolTerm) return true;
    return entry.aliases.some((alias) => matchesAlias(name, alias));
  });
}

export function catalogEntry(key: string): AiCatalogEntry | null {
  return AI_FEATURE_CATALOG.find((entry) => entry.key === key) ?? null;
}
