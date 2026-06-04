import type { LucideIcon } from "lucide-react";
import type { AiInsight } from "@minea/types";
import type { ViewConfig, ViewId } from "@/lib/views";
import { NAV_VIEWS, PROCESSES_VIEW } from "@/lib/views";

export interface WorkspaceMetrics {
  domainCount: number;
  capabilityCount: number;
  systemCount: number;
  productCount: number;
  processCount: number;
  journeyCount: number;
  investmentCount: number;
  mapInitialized: boolean;
  incompleteDomainCount: number;
  capabilitiesWithoutSystemCount: number;
  productsWithoutCapabilitiesCount: number;
}

export type ViewStatusTone = "ready" | "action" | "needs";

export interface DashboardViewCard {
  id: string;
  label: string;
  description: string;
  drawerDescription: string;
  href: string;
  galleryHref: string;
  ready: boolean;
  statusLabel: string;
  statusTone: ViewStatusTone;
  iconColor: string;
  icon: LucideIcon;
}

export interface ViewRequirement {
  label: string;
  met: boolean;
  actionLabel?: string;
  actionHref?: string;
}

export function buildViewRequirements(
  viewId: string,
  metrics: WorkspaceMetrics,
  basePath: string
): ViewRequirement[] {
  const capMap = `${basePath}/business/capabilities`;
  const products = `${basePath}/strategy/products`;
  const processes = `${basePath}/views/processes`;
  const journeys = `${basePath}/views/journeys`;
  const investments = `${basePath}/views/investments`;

  switch (viewId) {
    case "capability-heatmap":
      return [
        {
          label: "At least one capability",
          met: metrics.capabilityCount > 0,
          actionLabel: "Add",
          actionHref: capMap,
        },
        {
          label: "At least one domain",
          met: metrics.domainCount > 0,
          actionLabel: metrics.domainCount > 0 ? undefined : "Add",
          actionHref: metrics.domainCount > 0 ? undefined : capMap,
        },
      ];
    case "products":
      return [
        {
          label: "At least one product",
          met: metrics.productCount > 0,
          actionLabel: "Add",
          actionHref: products,
        },
        {
          label: "At least one capability",
          met: metrics.capabilityCount > 0,
          actionLabel: "Add",
          actionHref: capMap,
        },
      ];
    case "processes":
      return [
        {
          label: "At least one process",
          met: metrics.processCount > 0,
          actionLabel: "Add",
          actionHref: processes,
        },
      ];
    case "journeys":
      return [
        {
          label: "At least one journey",
          met: metrics.journeyCount > 0,
          actionLabel: "Add",
          actionHref: journeys,
        },
      ];
    case "investments":
      return [
        {
          label: "At least one investment",
          met: metrics.investmentCount > 0,
          actionLabel: "Add",
          actionHref: investments,
        },
      ];
    default:
      return [];
  }
}

export interface DashboardCta {
  message: string;
  actionLabel: string;
  actionHref: string;
}

export function isWorkspaceEmpty(metrics: WorkspaceMetrics): boolean {
  return (
    metrics.domainCount === 0 &&
    metrics.capabilityCount === 0 &&
    metrics.systemCount === 0 &&
    metrics.productCount === 0 &&
    metrics.processCount === 0 &&
    metrics.journeyCount === 0 &&
    metrics.investmentCount === 0
  );
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function greetingName(displayName: string | null | undefined, email: string | null | undefined): string {
  const raw = displayName?.trim() || email?.split("@")[0] || "there";
  const first = raw.split(/\s+/)[0] ?? raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function metricSubtexts(
  metrics: WorkspaceMetrics,
  insights: AiInsight[] = []
): {
  domains: string;
  capabilities: string;
  systems: string;
  products: string;
} {
  const unlinkedInvestments = countInsight(insights, "investment", "unlinked");

  const domains =
    metrics.domainCount === 0
      ? "none yet"
      : metrics.incompleteDomainCount > 0
        ? `${metrics.incompleteDomainCount} incomplete`
        : "all defined";

  const capabilities =
    metrics.capabilityCount === 0
      ? "none yet"
      : metrics.capabilitiesWithoutSystemCount > 0
        ? `${metrics.capabilitiesWithoutSystemCount} unmapped`
        : "all mapped";

  const systems =
    metrics.systemCount === 0
      ? "none yet"
      : metrics.capabilitiesWithoutSystemCount > 0
        ? `${metrics.capabilitiesWithoutSystemCount} gaps`
        : "all mapped";

  const products =
    metrics.productCount === 0
      ? "none yet"
      : metrics.productsWithoutCapabilitiesCount > 0
        ? `${metrics.productsWithoutCapabilitiesCount} incomplete`
        : unlinkedInvestments > 0
          ? `${unlinkedInvestments} with gaps`
          : "all mapped";

  return { domains, capabilities, systems, products };
}

/** Share of core repository + view prerequisites defined (0–100). */
export function workspaceCompletenessPercent(metrics: WorkspaceMetrics): number {
  const steps = [
    metrics.domainCount > 0,
    metrics.capabilityCount > 0,
    metrics.systemCount > 0,
    metrics.productCount > 0,
    metrics.processCount > 0,
    metrics.journeyCount > 0,
    metrics.investmentCount > 0,
  ];
  const done = steps.filter(Boolean).length;
  return Math.round((done / steps.length) * 100);
}

function normalizeInsightTitle(title: string): string {
  return title.toLowerCase().replace(/\d+/g, "#").trim();
}

/** Merge AI insights with metric-based gaps so sparse workspaces still feel guided. */
export function buildDashboardInsights(
  metrics: WorkspaceMetrics,
  aiInsights: AiInsight[]
): AiInsight[] {
  const seen = new Set(aiInsights.map((i) => normalizeInsightTitle(i.title)));
  const extras: AiInsight[] = [];

  const add = (
    title: string,
    severity: "low" | "medium" | "high",
    description: string,
    type: AiInsight["type"] = "gap"
  ) => {
    const key = normalizeInsightTitle(title);
    if (seen.has(key)) return;
    seen.add(key);
    extras.push({
      id: `local-${extras.length}`,
      type,
      title,
      description,
      severity,
      affected_object_ids: [],
      created_at: new Date().toISOString(),
    });
  };

  if (
    metrics.domainCount === 0 &&
    metrics.capabilityCount === 0 &&
    metrics.systemCount === 0 &&
    metrics.productCount === 0
  ) {
    add(
      "Capability map not started",
      "high",
      "Add domains and capabilities from the capability map — most views build on this foundation."
    );
  } else if (metrics.domainCount > 0 && metrics.capabilityCount === 0) {
    add(
      `${metrics.domainCount} domain${metrics.domainCount === 1 ? "" : "s"} have no capabilities mapped`,
      "high",
      "Define what each domain does on the capability map so heatmaps and portfolios can analyse your architecture."
    );
  } else if (metrics.capabilityCount === 0) {
    add(
      "No capabilities defined yet",
      "medium",
      "Capabilities describe what your business does — they unlock the capability heatmap and product portfolio views."
    );
  }

  if (metrics.productCount === 0) {
    add(
      "No products defined yet",
      "medium",
      "Products connect customer offerings to capabilities — add them to use the product portfolio view."
    );
  }

  if (metrics.systemCount === 0 && metrics.capabilityCount > 0) {
    add(
      "No systems registered yet",
      "medium",
      "Link applications to capabilities so you can see technology coverage and gaps."
    );
  }

  if (
    metrics.processCount === 0 &&
    (metrics.capabilityCount > 0 || metrics.productCount > 0)
  ) {
    add(
      "No processes documented yet",
      "low",
      "Processes show end-to-end flows and bottlenecks once capabilities and products exist."
    );
  }

  if (metrics.journeyCount === 0 && metrics.processCount > 0) {
    add(
      "No customer journeys mapped yet",
      "low",
      "Journeys connect customer steps to back-end processes — add one when you are ready to analyse experience gaps."
    );
  }

  if (
    metrics.investmentCount === 0 &&
    (metrics.capabilityCount > 0 || metrics.productCount > 0)
  ) {
    add(
      "No investments in pipeline yet",
      "low",
      "Track initiatives and impact in the investment pipeline when you start prioritising change."
    );
  }

  const hasOwnerGap = aiInsights.some((i) => i.title.toLowerCase().includes("no owner"));
  if (metrics.capabilityCount > 0 && !hasOwnerGap) {
    add(
      "No capability owners set",
      "medium",
      "Assign owners on the capability map for accountability and governance reporting."
    );
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  return [...aiInsights, ...extras].sort(
    (a, b) =>
      (severityRank[a.severity ?? "low"] ?? 3) - (severityRank[b.severity ?? "low"] ?? 3)
  );
}

export function dashboardPrimaryCta(
  metrics: WorkspaceMetrics,
  basePath: string
): DashboardCta | null {
  if (metrics.capabilityCount > 0) return null;

  if (metrics.domainCount > 0) {
    return {
      message:
        "Add capabilities to unlock Capability heatmap and Product portfolio — your two most useful views.",
      actionLabel: "Add capabilities",
      actionHref: `${basePath}/business/capabilities`,
    };
  }

  return {
    message:
      "Set up your capability map first — domains and capabilities unlock heatmaps, portfolios, and richer insights.",
    actionLabel: "Open capability map",
    actionHref: `${basePath}/business/capabilities`,
  };
}

function countInsight(insights: AiInsight[], titleNeedle: string, altNeedle?: string): number {
  const match = insights.find(
    (i) =>
      i.title.toLowerCase().includes(titleNeedle) &&
      (!altNeedle || i.title.toLowerCase().includes(altNeedle))
  );
  if (!match) return 0;
  const num = match.title.match(/(\d+)/);
  return num ? parseInt(num[1]!, 10) : 0;
}

const DASHBOARD_EXTRA_VIEWS: ViewConfig[] = [PROCESSES_VIEW];

export function buildDashboardViewCards(
  basePath: string,
  metrics: WorkspaceMetrics
): DashboardViewCard[] {
  const allViews = [...NAV_VIEWS, ...DASHBOARD_EXTRA_VIEWS];
  const galleryHref = `${basePath}/views`;

  return allViews.map((view) => {
    const { ready, statusLabel, statusTone } = viewReadiness(view.id, metrics);
    return {
      id: view.id,
      label: view.label,
      description: view.description,
      drawerDescription: view.drawerDescription,
      href: `${basePath}/${view.segment}`,
      galleryHref,
      ready,
      statusLabel,
      statusTone,
      iconColor: view.color,
      icon: view.icon,
    };
  });
}

export function viewReadiness(
  viewId: ViewId | "processes",
  metrics: WorkspaceMetrics
): { ready: boolean; statusLabel: string; statusTone: ViewStatusTone } {
  const ready = { ready: true as const, statusLabel: "Ready", statusTone: "ready" as const };

  switch (viewId) {
    case "products":
      return metrics.productCount > 0
        ? ready
        : { ready: false, statusLabel: "Add products", statusTone: "action" };
    case "capability-heatmap":
      return metrics.capabilityCount > 0
        ? ready
        : { ready: false, statusLabel: "Add capabilities", statusTone: "action" };
    case "processes":
      return metrics.processCount > 0
        ? ready
        : { ready: false, statusLabel: "Needs processes", statusTone: "needs" };
    case "journeys":
      return metrics.journeyCount > 0
        ? ready
        : { ready: false, statusLabel: "Needs journeys", statusTone: "needs" };
    case "investments":
      return metrics.investmentCount > 0
        ? ready
        : { ready: false, statusLabel: "Needs investments", statusTone: "needs" };
    case "tech-debt":
      return ready;
    default:
      return { ready: false, statusLabel: "Needs data", statusTone: "needs" };
  }
}

export const SETUP_BANNER_STORAGE_KEY = "bubo-setup-banner-dismissed";

export function setupBannerDismissKey(orgSlug: string, workspaceSlug: string): string {
  return `${SETUP_BANNER_STORAGE_KEY}:${orgSlug}:${workspaceSlug}`;
}
