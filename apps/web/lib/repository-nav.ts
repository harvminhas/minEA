/**
 * Repository sidebar — aligned to the EA meta-model layers.
 * Paths may cross canonical object layers (e.g. capability map lives under business/* routes).
 */

export type NavBadge = "new" | "upcoming";

export type RepositoryNavItem = {
  label: string;
  /** Path segment after workspace basePath (no leading slash). */
  segment: string;
  badge?: NavBadge;
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

export const REPOSITORY_LAYERS: RepositoryLayer[] = [
  {
    id: "strategy",
    label: "Strategy",
    color: "#8b5cf6",
    items: [
      { label: "Products", segment: "strategy/products" },
      { label: "Roadmaps", segment: "strategy/roadmaps", badge: "new" },
      { label: "Value Streams", segment: "strategy/value-streams", badge: "upcoming" },
      { label: "Capability Map", segment: "business/capabilities" },
    ],
  },
  {
    id: "business",
    label: "Business",
    color: "#3b82f6",
    items: [{ label: "Processes", segment: "views/processes" }],
  },
  {
    id: "application",
    label: "Application",
    color: "#6366f1",
    items: [
      { label: "Systems", segment: "application/applications" },
      { label: "Components", segment: "application/components", badge: "new" },
    ],
  },
  {
    id: "integration",
    label: "Integration",
    color: "#14b8a6",
    items: [
      { label: "APIs", segment: "integration/apis" },
      { label: "Events", segment: "integration/events" },
      { label: "Flows", segment: "integration/flows" },
    ],
  },
  {
    id: "data",
    label: "Data",
    color: "#f59e0b",
    items: [
      { label: "Data Entities", segment: "data/data-objects" },
      { label: "Data Stores", segment: "data/data-stores" },
      { label: "Data Domains", segment: "data/data-domains" },
    ],
  },
  {
    id: "technology",
    label: "Technology",
    color: "#64748b",
    badge: "new",
    items: [
      { label: "Platforms", segment: "infrastructure/cloud-services" },
      { label: "Integration Infra", segment: "integration/tools" },
      { label: "Runtimes", segment: "infrastructure/models" },
    ],
  },
  {
    id: "people",
    label: "People",
    color: "#e11d48",
    items: [
      { label: "Roles", segment: "people/roles" },
      { label: "Teams", segment: "people/teams" },
    ],
  },
  {
    id: "risk",
    label: "Risk",
    color: "#dc2626",
    badge: "new",
    items: [{ label: "Tech Debt", segment: "risk/tech-debt" }],
  },
];
