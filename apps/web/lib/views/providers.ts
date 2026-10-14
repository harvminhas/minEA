import type { ImpactEdge, ImpactNode } from "@/lib/impact/relationship-impact";
import { exactCatalogTool, normalizeTerm } from "@/lib/setup/match-tools";
import type { ChainItem } from "@/lib/views/opening";

/**
 * Cloud-only and desktop-only estates have no servers, yet a SaaS app still runs on something: its
 * provider. These are DERIVED hosts, never saved: each Cloud (SaaS) app with no runs_on / built_on
 * link "runs on" its vendor (Microsoft for Teams and Microsoft 365, Intuit for QuickBooks…), and each
 * desktop app on "People's computers". Impact can then say "If Microsoft goes down → these apps break".
 */
export const DERIVED_PREFIX = "provider:";
export const DESKTOP_HOST_ID = `${DERIVED_PREFIX}people-computers`;
export const UNKNOWN_PROVIDER = "Cloud provider not known";
const CLOUD = new Set(["saas", "cloud", "paas"]);

export type ProviderApp = { id: string; name: string; vendor?: string; properties?: Record<string, unknown> | null };
export type ProviderGroup = { id: string; name: string; desktop: boolean; apps: { id: string; name: string }[] };

export const isDerivedHost = (id: string | undefined | null) => Boolean(id?.startsWith(DERIVED_PREFIX));

/** The SaaS provider an app runs on: its saved vendor, else the catalogue's vendor for that name. */
export function providerName(app: ProviderApp): string {
  const saved = String(app.vendor || app.properties?.vendor || "").trim();
  if (saved) return saved;
  return exactCatalogTool(app.name)?.vendor?.trim() || UNKNOWN_PROVIDER;
}

/** Apps with no real host link, grouped by provider (cloud) or People's computers (desktop). */
export function providerGroups(apps: ProviderApp[], edges: ImpactEdge[]): ProviderGroup[] {
  const linked = new Set(edges.filter((edge) => edge.type === "runs_on" || edge.type === "built_on").map((edge) => edge.fromId));
  const groups = new Map<string, ProviderGroup>();
  for (const app of apps) {
    if (linked.has(app.id)) continue;
    const hosting = String(app.properties?.hosting_model ?? "");
    let group: ProviderGroup;
    if (hosting === "desktop") {
      group = groups.get(DESKTOP_HOST_ID) ?? { id: DESKTOP_HOST_ID, name: "People's computers", desktop: true, apps: [] };
    } else if (CLOUD.has(hosting)) {
      const name = providerName(app);
      const id = `${DERIVED_PREFIX}${normalizeTerm(name).replace(/\s+/g, "-") || "unknown"}`;
      group = groups.get(id) ?? { id, name, desktop: false, apps: [] };
    } else continue;
    group.apps.push({ id: app.id, name: app.name });
    groups.set(group.id, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.desktop) - Number(b.desktop) || b.apps.length - a.apps.length || a.name.localeCompare(b.name));
}

/** The derived hosts as Impact items, nodes and runs_on edges. */
export function derivedHosting(apps: ProviderApp[], edges: ImpactEdge[]): { items: ChainItem[]; nodes: ImpactNode[]; edges: ImpactEdge[] } {
  const groups = providerGroups(apps, edges);
  return {
    items: groups.map((group) => ({
      id: group.id,
      name: group.name,
      kind: "platform" as const,
      ownerTeam: "",
      criticality: "",
      description: group.desktop ? "Installed desktop software" : "Cloud provider",
      properties: { derived: true, derived_kind: group.desktop ? "desktop" : "provider" },
    })),
    nodes: groups.map((group) => ({ id: group.id, name: group.name, typeLabel: group.desktop ? "People's computers" : "Cloud provider" })),
    edges: groups.flatMap((group) => group.apps.map((app) => ({ type: "runs_on", fromId: app.id, toId: group.id }))),
  };
}
