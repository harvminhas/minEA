/** Model sidebar ARCHITECTURE section: three everyday items, the rest behind an Advanced toggle. */

export type ArchNavItem = {
  key: string;
  label: string;
  href: string;
  match: string[];
  advanced: boolean;
  /** Counted toward "this workspace already uses it" (auto-enables Advanced). */
  countKey?: HiddenCountKey;
};

export type HiddenCountKey = "processes" | "products" | "journeys" | "dataStores" | "dataDomains";
export type HiddenCounts = Partial<Record<HiddenCountKey, number | undefined>>;

export function architectureItems(basePath: string): ArchNavItem[] {
  return [
    { key: "capabilities", label: "Capability map", href: `${basePath}/model/capabilities`, match: ["/model/capabilities", "/business/capabilities"], advanced: false },
    { key: "roadmap", label: "Roadmap & renewals", href: `${basePath}/strategy/roadmaps`, match: ["/strategy/roadmaps"], advanced: false },
    { key: "sensitive-data", label: "Sensitive data", href: `${basePath}/data/data-objects`, match: ["/data/data-objects"], advanced: false },
    { key: "processes", label: "Processes", href: `${basePath}/views/processes`, match: ["/views/processes"], advanced: true, countKey: "processes" },
    { key: "products", label: "Products", href: `${basePath}/strategy/products`, match: ["/strategy/products", "/views/products"], advanced: true, countKey: "products" },
    { key: "journeys", label: "Journeys", href: `${basePath}/views/journeys`, match: ["/views/journeys"], advanced: true, countKey: "journeys" },
    { key: "investments", label: "Investments", href: `${basePath}/views/investments`, match: ["/views/investments"], advanced: true },
    { key: "heatmap", label: "Capability heatmap", href: `${basePath}/views/capability-heatmap`, match: ["/views/capability-heatmap"], advanced: true },
    { key: "data-stores", label: "Data stores", href: `${basePath}/data/data-stores`, match: ["/data/data-stores"], advanced: true, countKey: "dataStores" },
    { key: "data-domains", label: "Data domains", href: `${basePath}/data/data-domains`, match: ["/data/data-domains"], advanced: true, countKey: "dataDomains" },
  ];
}

/** Workspaces that already hold records in a hidden type get Advanced on, so nothing disappears. */
export function hasAdvancedRecords(counts: HiddenCounts): boolean {
  return Object.values(counts).some((value) => (value ?? 0) > 0);
}

/** An explicit choice wins; otherwise Advanced follows whether the workspace already uses those types. */
export function advancedEnabled(stored: boolean | null | undefined, counts: HiddenCounts): boolean {
  if (typeof stored === "boolean") return stored;
  return hasAdvancedRecords(counts);
}

/** Items to show. An advanced page you are on stays listed even with Advanced off (direct URL). */
export function visibleArchitectureItems(items: ArchNavItem[], advanced: boolean, pathname = ""): ArchNavItem[] {
  return items.filter((item) => !item.advanced || advanced || item.match.some((fragment) => pathname.includes(fragment)));
}

export const ADVANCED_LOCAL_KEY = (orgSlug: string, workspaceSlug: string) => `bubomap-arch-advanced:${orgSlug}/${workspaceSlug}`;
