import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowLeftRight, GitBranch, Grid3X3, Layers, Map, Package, TrendingUp } from "lucide-react";

/** v1 fixed views — not user-defined (spec §2). */
export type ViewId =
  | "products"
  | "processes"
  | "journeys"
  | "capability-heatmap"
  | "investments"
  | "tech-debt"
  | "integration-health"
  | "foundations";

export interface ViewConfig {
  id: ViewId;
  label: string;
  /** Short tagline shown in the gallery card */
  description: string;
  /** Longer copy for the workspace dashboard view drawer */
  drawerDescription: string;
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
  description: "Health and overlap analysis",
  drawerDescription:
    "An overview of all products, what capabilities they rely on, and which systems underpin them.",
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
  description: "End-to-end process flows",
  drawerDescription:
    "End-to-end flows with stages and cycle times — spot bottlenecks and link each stage to the capabilities it needs.",
  segment: "views/processes",
  icon: GitBranch,
  color: "#0ea5e9",
  anchorQuestion: "Show me our end-to-end processes with cycle time per stage.",
  emptyTitle: "No processes yet",
  emptyDescription:
    "A process is an end-to-end flow with stages — like Merchant onboarding or Dispute resolution. Add stages, link required capabilities, and enter cycle times to spot bottlenecks.",
  emptyCta: "Add your first process",
};

/** Product portfolio + v1 views — used in Views sidebar and split panel picker. */
export const VIEWS_V1: ViewConfig[] = [
  {
    id: "capability-heatmap",
    label: "Capability heatmap",
    description: "System health across domains",
    drawerDescription:
      "A heat-mapped grid of all capabilities across domains — showing investment coverage, system support, and ownership gaps at a glance.",
    segment: "views/capability-heatmap",
    icon: Grid3X3,
    color: "#22c55e",
    anchorQuestion: "Show me a one-screen map of our business, colored by automation maturity.",
    emptyTitle: "Nothing to heatmap yet",
    emptyDescription:
      "Populate business capabilities and their realizations in the repository. This view colors each capability by maturity (manual → automated) — read-only over data created elsewhere.",
  },
  {
    id: "journeys",
    label: "Journeys",
    description: "Customer experience paths",
    drawerDescription:
      "Map the customer journey step by step, link transitions to back-end processes, and see where the experience breaks down.",
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
    id: "investments",
    label: "Investment pipeline",
    description: "Prioritised initiatives by impact",
    drawerDescription:
      "Active and proposed investments ranked by impact — tied to capabilities, products, and the bottlenecks you want to fix.",
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
    id: "tech-debt",
    label: "Tech debt",
    description: "Open debt across the estate",
    drawerDescription:
      "All open debt items across systems, components, and platforms — attached and floating — with severity, ownership, and remediation plans.",
    segment: "views/tech-debt",
    icon: AlertTriangle,
    color: "#dc2626",
    anchorQuestion: "Show me all technical debt and what still needs to be linked.",
    emptyTitle: "No tech debt yet",
    emptyDescription:
      "Record known issues as debt items. Attach them to systems or components for product roll-up, or leave them unattached until you know where they belong.",
    emptyCta: "Add debt item",
  },
  {
    id: "foundations",
    label: "Tech Stack",
    description: "Platforms and runtimes supporting systems",
    drawerDescription:
      "What your systems are built on and where they run — grouped by enterprise platform type or compute runtime.",
    segment: "views/foundations",
    icon: Layers,
    color: "#6366f1",
    anchorQuestion: "Show me what platforms and runtimes underpin our application estate.",
    emptyTitle: "No systems to map yet",
    emptyDescription:
      "Add systems in the Application layer, link them to Platforms (built on) and Runtimes (runs on) in Object links. This view groups the estate for executive scanning.",
    emptyCta: "Add systems",
  },
  {
    id: "integration-health",
    label: "Integration health",
    description: "APIs, events, and flows at a glance",
    drawerDescription:
      "Every API, event, and data flow across your estate — highlighting manual processes, no-code integrations, and APIs without registered consumers.",
    segment: "views/integration-health",
    icon: ArrowLeftRight,
    color: "#14b8a6",
    anchorQuestion:
      "Show me every integration and where it depends on people instead of systems.",
    emptyTitle: "No integrations yet",
    emptyDescription:
      "Add flows, APIs, and events in the Integration layer. This view surfaces manual handoffs, no-code tools, and public APIs missing consumer records.",
    emptyCta: "Add a flow",
  },
];

const ALL_VIEWS_LIST: ViewConfig[] = [PRODUCTS_VIEW, PROCESSES_VIEW, ...VIEWS_V1];

/** Sidebar / Views mode nav order */
const NAV_VIEW_IDS: ViewId[] = [
  "foundations",
  "integration-health",
  "tech-debt",
  "products",
  "capability-heatmap",
  "journeys",
  "investments",
];

export const NAV_VIEWS: ViewConfig[] = NAV_VIEW_IDS.map(
  (id) => ALL_VIEWS_LIST.find((v) => v.id === id)!
);

const ALL_VIEWS: ViewConfig[] = ALL_VIEWS_LIST;

/** All views that can render in the split panel (includes Processes). */
export const SPLIT_PANEL_VIEWS: ViewConfig[] = [...NAV_VIEWS, PROCESSES_VIEW];

export function isViewsAreaPath(pathname: string): boolean {
  return /\/views(\/|$)/.test(pathname);
}

/** Resolve a view id from a workspace pathname, if the URL is a view route. */
export function viewIdFromPathname(pathname: string): ViewId | null {
  for (const view of ALL_VIEWS) {
    if (pathname.includes(`/${view.segment}`)) return view.id;
  }
  return null;
}

export function isViewId(id: string): id is ViewId {
  return ALL_VIEWS.some((v) => v.id === id);
}

/** Coerce persisted or legacy view ids to a valid v1 view. */
export function resolveViewId(id: string | undefined, fallback: ViewId = "products"): ViewId {
  return id && isViewId(id) ? id : fallback;
}

export function getView(id: ViewId): ViewConfig {
  const view = ALL_VIEWS.find((v) => v.id === id);
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

/** Workspace home — dashboard with zero / populated states. */
export function workspaceHomePath(orgSlug: string, workspaceSlug: string): string {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}`;
}

export function primaryViewPath(orgSlug: string, workspaceSlug: string): string {
  return workspaceHomePath(orgSlug, workspaceSlug);
}

export function embedViewPath(orgSlug: string, workspaceSlug: string, viewId: ViewId): string {
  const view = getView(viewId);
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/embed/${view.segment}`;
}
