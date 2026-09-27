/**
 * Repository sidebar — aligned to the EA meta-model layers.
 * Paths may cross canonical object layers (e.g. capability map lives under business/* routes).
 */

import type { ObjectType } from "@minea/types";

export type NavBadge = "new" | "upcoming";

/** How to resolve object totals for sidebar counts. */
export type NavCountSource =
  | { kind: "objects"; type: ObjectType }
  | { kind: "objects-multi"; types: ObjectType[] }
  | { kind: "products" }
  | { kind: "processes" }
  | { kind: "capability-map" }
  | { kind: "people-roles" }
  | { kind: "people-teams" }
  | { kind: "people-contacts" };

export type RepositoryNavItem = {
  label: string;
  /** Path segment after workspace basePath (no leading slash). */
  segment: string;
  badge?: NavBadge;
  /** Omit from sidebar navigation; route and data model remain available. */
  hidden?: boolean;
  /**
   * Group label navigates here. The row is not repeated in the expanded child list.
   */
  header?: boolean;
  /** Omit for upcoming items; used to fetch sidebar totals. */
  countSource?: NavCountSource;
};

export type RepositoryLayer = {
  id: string;
  label: string;
  color: string;
  /** Section-level badge (e.g. Technology → NEW). */
  badge?: NavBadge;
  items: RepositoryNavItem[];
};

export function isNavItemHidden(item: RepositoryNavItem): boolean {
  return item.hidden === true;
}

export function isNavItemDisabled(item: RepositoryNavItem): boolean {
  return item.badge === "upcoming";
}

export function visibleNavItems(layer: RepositoryLayer): RepositoryNavItem[] {
  return layer.items.filter((item) => !isNavItemHidden(item));
}

export function layerHeaderItem(layer: RepositoryLayer): RepositoryNavItem | undefined {
  return visibleNavItems(layer).find((item) => item.header);
}

export function layerChildItems(layer: RepositoryLayer): RepositoryNavItem[] {
  return visibleNavItems(layer).filter((item) => !item.header);
}

/** Sum of enabled subnav item counts for a layer header. */
export function layerNavCountTotal(
  layer: RepositoryLayer,
  countsBySegment: Record<string, number>
): number {
  return visibleNavItems(layer)
    .filter((item) => !isNavItemDisabled(item))
    .reduce((sum, item) => sum + (countsBySegment[item.segment] ?? 0), 0);
}

export const REPOSITORY_LAYERS: RepositoryLayer[] = [
  {
    id: "systems",
    label: "Systems",
    color: "#64748b",
    items: [
      {
        label: "Systems",
        segment: "application/applications",
        header: true,
        countSource: {
          kind: "objects-multi",
          types: ["application", "solution", "technical_capability"],
        },
      },
      {
        label: "Components",
        segment: "application/components",
        countSource: { kind: "objects", type: "component" },
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    color: "#64748b",
    items: [
      { label: "APIs", segment: "integration/apis", countSource: { kind: "objects", type: "api" } },
      { label: "Events", segment: "integration/events", countSource: { kind: "objects", type: "event" } },
      {
        label: "Flows",
        segment: "integration/flows",
        countSource: { kind: "objects", type: "integration_flow" },
      },
      {
        label: "Integration infra",
        segment: "integration/tools",
        countSource: { kind: "objects", type: "tool" },
      },
    ],
  },
  {
    id: "platforms",
    label: "Platforms",
    color: "#64748b",
    items: [
      {
        label: "Platforms",
        segment: "infrastructure/cloud-services",
        header: true,
        countSource: { kind: "objects", type: "cloud_service" },
      },
      {
        label: "Runtimes",
        segment: "infrastructure/models",
        countSource: { kind: "objects", type: "model" },
      },
    ],
  },
  {
    id: "people",
    label: "People",
    color: "#64748b",
    items: [
      { label: "Roles", segment: "people/roles", countSource: { kind: "people-roles" } },
      { label: "Teams", segment: "people/teams", countSource: { kind: "people-teams" } },
      { label: "Contacts", segment: "people/contacts", countSource: { kind: "people-contacts" } },
    ],
  },
  {
    id: "business",
    label: "Business",
    color: "#64748b",
    items: [
      {
        label: "Capabilities",
        segment: "business/capabilities",
        countSource: { kind: "capability-map" },
      },
      { label: "Processes", segment: "views/processes", countSource: { kind: "processes" } },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    color: "#64748b",
    items: [
      { label: "Products", segment: "strategy/products", countSource: { kind: "products" } },
      {
        label: "Roadmaps",
        segment: "strategy/roadmaps",
        countSource: { kind: "objects", type: "roadmap_item" },
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    color: "#64748b",
    items: [
      {
        label: "Entities",
        segment: "data/data-objects",
        countSource: { kind: "objects", type: "data_object" },
      },
      {
        label: "Stores",
        segment: "data/data-stores",
        countSource: { kind: "objects", type: "data_store" },
      },
      {
        label: "Domains",
        segment: "data/data-domains",
        countSource: { kind: "objects", type: "data_domain" },
      },
    ],
  },
];

export const REPOSITORY_NAV_ITEMS: RepositoryNavItem[] = REPOSITORY_LAYERS.flatMap((l) =>
  visibleNavItems(l)
);
