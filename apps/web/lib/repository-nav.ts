/**
 * Repository sidebar — aligned to the EA meta-model layers.
 * Paths may cross canonical object layers (e.g. capability map lives under business/* routes).
 */

export type RepositoryNavItem = {
  label: string;
  /** Path segment after workspace basePath (no leading slash). */
  segment: string;
  upcoming?: boolean;
};

export type RepositoryLayer = {
  id: string;
  label: string;
  color: string;
  items: RepositoryNavItem[];
};

export const REPOSITORY_LAYERS: RepositoryLayer[] = [
  {
    id: "strategy",
    label: "Strategy",
    color: "#8b5cf6",
    items: [
      { label: "Products", segment: "views/products" },
      { label: "Value Streams", segment: "strategy/value-streams", upcoming: true },
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
    items: [{ label: "Systems", segment: "application/applications" }],
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
      { label: "Data Domains", segment: "data/data-domains", upcoming: true },
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
];
