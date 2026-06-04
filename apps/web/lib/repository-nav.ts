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
  | { kind: "people-teams" };

export type RepositoryNavItem = {
  label: string;
  /** Path segment after workspace basePath (no leading slash). */
  segment: string;
  badge?: NavBadge;
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

export function isNavItemDisabled(item: RepositoryNavItem): boolean {
  return item.badge === "upcoming";
}

/** Sum of enabled subnav item counts for a layer header. */
export function layerNavCountTotal(
  layer: RepositoryLayer,
  countsBySegment: Record<string, number>
): number {
  return layer.items
    .filter((item) => !isNavItemDisabled(item))
    .reduce((sum, item) => sum + (countsBySegment[item.segment] ?? 0), 0);
}

export const REPOSITORY_LAYERS: RepositoryLayer[] = [
  {
    id: "strategy",
    label: "Strategy",
    color: "#8b5cf6",
    items: [
      { label: "Products", segment: "strategy/products", countSource: { kind: "products" } },
      {
        label: "Roadmaps",
        segment: "strategy/roadmaps",
        badge: "new",
        countSource: { kind: "objects", type: "roadmap_item" },
      },
    ],
  },
  {
    id: "business",
    label: "Business",
    color: "#3b82f6",
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
    id: "application",
    label: "Application",
    color: "#6366f1",
    items: [
      {
        label: "Systems",
        segment: "application/applications",
        countSource: {
          kind: "objects-multi",
          types: ["application", "solution", "technical_capability"],
        },
      },
      {
        label: "Components",
        segment: "application/components",
        badge: "new",
        countSource: { kind: "objects", type: "component" },
      },
    ],
  },
  {
    id: "integration",
    label: "Integration",
    color: "#14b8a6",
    items: [
      { label: "APIs", segment: "integration/apis", countSource: { kind: "objects", type: "api" } },
      { label: "Events", segment: "integration/events", countSource: { kind: "objects", type: "event" } },
      {
        label: "Flows",
        segment: "integration/flows",
        countSource: { kind: "objects", type: "integration_flow" },
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    color: "#f59e0b",
    items: [
      {
        label: "Data Entities",
        segment: "data/data-objects",
        countSource: { kind: "objects", type: "data_object" },
      },
      {
        label: "Data Stores",
        segment: "data/data-stores",
        countSource: { kind: "objects", type: "data_store" },
      },
      {
        label: "Data Domains",
        segment: "data/data-domains",
        countSource: { kind: "objects", type: "data_domain" },
      },
    ],
  },
  {
    id: "technology",
    label: "Technology",
    color: "#64748b",
    badge: "new",
    items: [
      {
        label: "Platforms",
        segment: "infrastructure/cloud-services",
        countSource: { kind: "objects", type: "cloud_service" },
      },
      {
        label: "Integration Infra",
        segment: "integration/tools",
        countSource: { kind: "objects", type: "tool" },
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
    color: "#e11d48",
    items: [
      { label: "Roles", segment: "people/roles", countSource: { kind: "people-roles" } },
      { label: "Teams", segment: "people/teams", countSource: { kind: "people-teams" } },
    ],
  },
];

export const REPOSITORY_NAV_ITEMS: RepositoryNavItem[] = REPOSITORY_LAYERS.flatMap((l) => l.items);
