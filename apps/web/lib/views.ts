import type { LucideIcon } from "lucide-react";
import {
  GitBranch,
  Grid3X3,
  Map,
  Package,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

/** v1 fixed views — not user-defined (spec §2). */
export type ViewId =
  | "products"
  | "processes"
  | "journeys"
  | "capability-heatmap"
  | "investments"
  | "ai-infrastructure"
  | "insights";

export interface ViewConfig {
  id: ViewId;
  label: string;
  segment: string;
  icon: LucideIcon;
  color: string;
  anchorQuestion: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyCta?: string;
}

export const PRIMARY_VIEW_ID: ViewId = "products";

export const PRODUCTS_VIEW: ViewConfig = {
  id: "products",
  label: "Product portfolio",
  segment: "views/products",
  icon: Package,
  color: "#6366f1",
  anchorQuestion: "Show me our products and what they depend on.",
  emptyTitle: "No products yet",
  emptyDescription:
    "A product is something your business offers — like Payments or Merchant onboarding. Map each product to the business capabilities it delivers; systems and processes are inferred from there.",
  emptyCta: "Add your first product",
};

/** Processes lives under Repository → Business in the sidebar, not under Views. */
export const PROCESSES_VIEW: ViewConfig = {
  id: "processes",
  label: "Processes",
  segment: "views/processes",
  icon: GitBranch,
  color: "#0ea5e9",
  anchorQuestion: "Show me our end-to-end processes with cycle time per stage.",
  emptyTitle: "No processes yet",
  emptyDescription:
    "A process is an end-to-end flow with stages — like Merchant onboarding or Dispute resolution. Add stages, link required capabilities, and enter cycle times to spot bottlenecks.",
  emptyCta: "Add your first process",
};

export const VIEWS_V1: ViewConfig[] = [
  {
    id: "journeys",
    label: "Journeys",
    segment: "views/journeys",
    icon: Map,
    color: "#ec4899",
    anchorQuestion: "Show me the customer's path and where it breaks down.",
    emptyTitle: "No journeys yet",
    emptyDescription:
      "A journey maps the customer experience step by step — like merchant onboarding or dispute resolution. Link steps to back-end processes and annotate transitions.",
    emptyCta: "Add your first journey",
  },
  {
    id: "capability-heatmap",
    label: "Capability heatmap",
    segment: "views/capability-heatmap",
    icon: Grid3X3,
    color: "#22c55e",
    anchorQuestion: "Show me a one-screen map of our business, colored by automation maturity.",
    emptyTitle: "Nothing to heatmap yet",
    emptyDescription:
      "Populate business capabilities and their realizations in the repository. This view colors each capability by maturity (manual → automated) — read-only over data created elsewhere.",
  },
  {
    id: "investments",
    label: "Investment pipeline",
    segment: "views/investments",
    icon: TrendingUp,
    color: "#f59e0b",
    anchorQuestion: "Show me our active and proposed investments, ranked by impact.",
    emptyTitle: "No investments yet",
    emptyDescription:
      "An investment targets a realization with a hypothesis and expected impact. Start from a bottleneck in Processes or the Capability heatmap, or create one here.",
    emptyCta: "Propose an investment",
  },
  {
    id: "ai-infrastructure",
    label: "AI infrastructure",
    segment: "views/ai-infrastructure",
    icon: Sparkles,
    color: "#a855f7",
    anchorQuestion: "Show me agents, models, and tools in this workspace.",
    emptyTitle: "No AI infrastructure yet",
    emptyDescription:
      "Add AI agents, tools, and models in the repository. This view is a lens over those entities.",
  },
  {
    id: "insights",
    label: "AI insights",
    segment: "views/insights",
    icon: Zap,
    color: "#eab308",
    anchorQuestion: "What gaps and risks does AI see in this architecture?",
    emptyTitle: "No insights yet",
    emptyDescription: "Generate insights from your repository to surface gaps, risks, and recommendations.",
    emptyCta: "Generate insights",
  },
];

export function getView(id: ViewId): ViewConfig {
  if (id === "products") return PRODUCTS_VIEW;
  if (id === "processes") return PROCESSES_VIEW;
  const view = VIEWS_V1.find((v) => v.id === id);
  if (!view) throw new Error(`Unknown view: ${id}`);
  return view;
}

export function viewPath(
  orgSlug: string,
  workspaceSlug: string,
  viewId: ViewId,
  opts?: { entityId?: string; filter?: Record<string, string> }
): string {
  const view = getView(viewId);
  const base = `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${view.segment}`;
  if (opts?.entityId) {
    return `${base}/${opts.entityId}`;
  }
  if (opts?.filter && Object.keys(opts.filter).length > 0) {
    const params = new URLSearchParams(opts.filter);
    return `${base}?${params.toString()}`;
  }
  return base;
}

export function primaryViewPath(orgSlug: string, workspaceSlug: string): string {
  return viewPath(orgSlug, workspaceSlug, PRIMARY_VIEW_ID);
}
