/** Model sidebar groups. Only Processes sits behind Show advanced. */

import { modelPath } from "@/lib/mvp-paths";

export type NavGroupId = "overview" | "business" | "technology" | "organisation" | "plan";

export type ModelNavItem = {
  key: string;
  label: string;
  href: string;
  match: string[];
  advanced?: boolean;
  /** Counted toward "this workspace already uses it" (auto-enables Advanced). */
  countKey?: HiddenCountKey;
};

export type ModelNavGroup = {
  id: NavGroupId;
  /** Null means no section label (Overview sits alone at the top). */
  label: string | null;
  items: ModelNavItem[];
};

export type HiddenCountKey = "processes";
export type HiddenCounts = Partial<Record<HiddenCountKey, number | undefined>>;

/**
 * Products, Journeys and the retired product-capability heatmap are not listed at all
 * (not even with Advanced on). Their direct URLs still render.
 */
export function modelNavGroups(basePath: string): ModelNavGroup[] {
  return [
    {
      id: "overview",
      label: null,
      items: [
        { key: "overview", label: "Overview", href: modelPath(basePath, "overview"), match: ["/model/overview"] },
      ],
    },
    {
      id: "business",
      label: "Business",
      items: [
        { key: "capabilities", label: "Capability map", href: `${basePath}/model/capabilities`, match: ["/model/capabilities", "/business/capabilities"] },
        { key: "data-domains", label: "Data domains", href: `${basePath}/data/data-domains`, match: ["/data/data-domains"] },
        { key: "sensitive-data", label: "Sensitive data", href: `${basePath}/data/data-objects`, match: ["/data/data-objects"] },
        { key: "processes", label: "Processes", href: `${basePath}/views/processes`, match: ["/views/processes"], advanced: true, countKey: "processes" },
      ],
    },
    {
      id: "technology",
      label: "Technology",
      items: [
        {
          key: "applications",
          label: "Applications",
          href: modelPath(basePath, "applications"),
          match: ["/application/applications", "/application/components", "/model/applications", "/model/agents", "/model/ai-models"],
        },
        {
          key: "platforms",
          label: "Platforms & cloud",
          href: modelPath(basePath, "platforms"),
          match: ["/model/platforms", "/model/locations"],
        },
        { key: "servers", label: "Servers & devices", href: modelPath(basePath, "servers"), match: ["/model/servers", "/model/infrastructure"] },
        { key: "data-stores", label: "Data stores", href: `${basePath}/data/data-stores`, match: ["/data/data-stores"] },
        {
          key: "connections",
          label: "Connections",
          href: modelPath(basePath, "connections"),
          match: ["/integration/", "/model/connections"],
        },
      ],
    },
    {
      id: "organisation",
      label: "Organisation",
      items: [
        { key: "vendors", label: "Vendors & contracts", href: modelPath(basePath, "vendors"), match: ["/model/vendors"] },
        { key: "people", label: "People & teams", href: modelPath(basePath, "owners"), match: ["/people/", "/model/owners"] },
      ],
    },
    {
      id: "plan",
      label: "Plan",
      items: [
        { key: "roadmap", label: "Roadmap & renewals", href: `${basePath}/strategy/roadmaps`, match: ["/strategy/roadmaps"] },
        { key: "investments", label: "Investments", href: `${basePath}/views/investments`, match: ["/views/investments"] },
      ],
    },
  ];
}

/** Only Processes remains behind Advanced; auto-on follows Processes records only. */
export function hasAdvancedRecords(counts: HiddenCounts): boolean {
  return (counts.processes ?? 0) > 0;
}

/** An explicit choice wins; otherwise Advanced follows whether the workspace already has processes. */
export function advancedEnabled(stored: boolean | null | undefined, counts: HiddenCounts): boolean {
  if (typeof stored === "boolean") return stored;
  return hasAdvancedRecords(counts);
}

/** Items to show. An advanced page you are on stays listed even with Advanced off (direct URL). */
export function visibleItems(items: ModelNavItem[], advanced: boolean, pathname = ""): ModelNavItem[] {
  return items.filter((item) => !item.advanced || advanced || item.match.some((fragment) => pathname.includes(fragment)));
}

export function visibleModelNavGroups(groups: ModelNavGroup[], advanced: boolean, pathname = ""): ModelNavGroup[] {
  return groups
    .map((group) => ({ ...group, items: visibleItems(group.items, advanced, pathname) }))
    .filter((group) => group.items.length > 0);
}

/** Platforms & cloud badge is platforms plus locations (locations are folded into that page). */
export function platformsCloudCount(platformCount: number, locationCount: number): number {
  return platformCount + locationCount;
}

export const ADVANCED_TOOLTIP = "Processes";

export const ADVANCED_LOCAL_KEY = (orgSlug: string, workspaceSlug: string) => `bubomap-arch-advanced:${orgSlug}/${workspaceSlug}`;

/** @deprecated Use modelNavGroups. Kept for any leftover imports during the cutover. */
export function architectureItems(basePath: string): ModelNavItem[] {
  return modelNavGroups(basePath).flatMap((group) => group.items).filter((item) => item.key !== "overview");
}

/** @deprecated Use visibleItems. */
export function visibleArchitectureItems(items: ModelNavItem[], advanced: boolean, pathname = ""): ModelNavItem[] {
  return visibleItems(items, advanced, pathname);
}
