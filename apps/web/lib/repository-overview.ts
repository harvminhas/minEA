import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Cpu,
  Database,
  Share2,
  Target,
  Users,
} from "lucide-react";

export type OverviewSubCount = {
  label: string;
  segment: string;
};

export type RepositoryOverviewCard = {
  id: string;
  label: string;
  color: string;
  icon: LucideIcon;
  /** Primary link — first segment in the group. */
  hrefSegment: string;
  /** Span two columns on the overview grid (People, Strategy). */
  wide?: boolean;
  subCounts: OverviewSubCount[];
};

export const REPOSITORY_OVERVIEW_CARDS: RepositoryOverviewCard[] = [
  {
    id: "systems",
    label: "Systems",
    color: "#6366f1",
    icon: AppWindow,
    hrefSegment: "application/applications",
    subCounts: [
      { label: "Applications", segment: "application/applications" },
      { label: "Data Stores", segment: "data/data-stores" },
      { label: "Foundation", segment: "infrastructure/cloud-services" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    color: "#14b8a6",
    icon: Share2,
    hrefSegment: "integration/apis",
    subCounts: [
      { label: "APIs", segment: "integration/apis" },
      { label: "Events", segment: "integration/events" },
      { label: "Flows", segment: "integration/flows" },
    ],
  },
  {
    id: "data",
    label: "Data",
    color: "#3b82f6",
    icon: Database,
    hrefSegment: "data/data-objects",
    subCounts: [
      { label: "Entities", segment: "data/data-objects" },
      { label: "Domains", segment: "data/data-domains" },
      { label: "Stores", segment: "data/data-stores" },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    color: "#d97706",
    icon: Cpu,
    hrefSegment: "infrastructure/cloud-services",
    subCounts: [
      { label: "Platforms", segment: "infrastructure/cloud-services" },
      { label: "Brokers", segment: "integration/tools" },
      { label: "Runtimes", segment: "infrastructure/models" },
    ],
  },
  {
    id: "people",
    label: "People",
    color: "#e11d48",
    icon: Users,
    hrefSegment: "people/teams",
    wide: true,
    subCounts: [
      { label: "Teams", segment: "people/teams" },
      { label: "Roles", segment: "people/roles" },
    ],
  },
  {
    id: "strategy",
    label: "Strategy",
    color: "#8b5cf6",
    icon: Target,
    hrefSegment: "strategy/products",
    wide: true,
    subCounts: [
      { label: "Products", segment: "strategy/products" },
      { label: "Capabilities", segment: "business/capabilities" },
      { label: "Roadmaps", segment: "strategy/roadmaps" },
    ],
  },
];

export function overviewCardTotal(
  card: RepositoryOverviewCard,
  countsBySegment: Record<string, number>
): number {
  return card.subCounts.reduce((sum, sub) => sum + (countsBySegment[sub.segment] ?? 0), 0);
}

export function formatOverviewSubCounts(
  card: RepositoryOverviewCard,
  countsBySegment: Record<string, number>
): string {
  return card.subCounts
    .map((sub) => `${countsBySegment[sub.segment] ?? 0} ${sub.label}`)
    .join(" · ");
}
