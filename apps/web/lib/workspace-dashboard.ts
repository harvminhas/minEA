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
  capabilitiesWithoutOwnerCount: number;
  shadowSystemCount: number;
}

export type ViewStatusTone = "healthy" | "action" | "needs";

export type MetricCardVariant = "default" | "warn" | "success";

export interface MetricCardState {
  subtext: string;
  variant: MetricCardVariant;
}

export interface StructuralGap {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  severity: "high" | "medium" | "low";
  badgeLabel: string;
  description?: string;
}

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
    case "integration-health":
      return [
        {
          label: "Flows, APIs, or events in repository",
          met: true,
          actionLabel: "Add integrations",
          actionHref: `${basePath}/integration/flows`,
        },
      ];
    case "foundations":
      return [
        {
          label: "At least one system",
          met: metrics.systemCount > 0,
          actionLabel: "Add systems",
          actionHref: `${basePath}/application/applications`,
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

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm ?? `${singular}s`;
}

function metricVariant(subtext: string): MetricCardVariant {
  const lower = subtext.toLowerCase();
  if (lower.includes("all mapped") || lower.includes("all defined") || lower.includes("all connected")) {
    return "success";
  }
  if (lower.includes("none yet")) return "default";
  return "warn";
}

export function zeroStateMetricCardStates(): {
  domains: MetricCardState;
  capabilities: MetricCardState;
  systems: MetricCardState;
  products: MetricCardState;
} {
  return {
    systems: { subtext: "start here", variant: "default" },
    domains: { subtext: "none yet", variant: "default" },
    capabilities: { subtext: "none yet", variant: "default" },
    products: { subtext: "none yet", variant: "default" },
  };
}

export function metricCardStates(metrics: WorkspaceMetrics): {
  domains: MetricCardState;
  capabilities: MetricCardState;
  systems: MetricCardState;
  products: MetricCardState;
} {
  const domainsSubtext =
    metrics.domainCount === 0
      ? "none yet"
      : metrics.incompleteDomainCount > 0
        ? `${metrics.incompleteDomainCount} missing ${plural(metrics.incompleteDomainCount, "capability")}`
        : "all defined";

  const capabilitiesSubtext =
    metrics.capabilityCount === 0
      ? "none yet"
      : metrics.capabilitiesWithoutSystemCount > 0
        ? `${metrics.capabilitiesWithoutSystemCount} no realising ${plural(metrics.capabilitiesWithoutSystemCount, "system")}`
        : "all mapped";

  const systemsSubtext =
    metrics.systemCount === 0
      ? "none yet"
      : metrics.shadowSystemCount > 0
        ? `${metrics.shadowSystemCount} shadow ${plural(metrics.shadowSystemCount, "system")}`
        : metrics.capabilitiesWithoutSystemCount > 0
          ? `${metrics.capabilitiesWithoutSystemCount} capability ${plural(metrics.capabilitiesWithoutSystemCount, "gap")}`
          : "all connected";

  const productsSubtext =
    metrics.productCount === 0
      ? "none yet"
      : metrics.productsWithoutCapabilitiesCount > 0
        ? `${metrics.productsWithoutCapabilitiesCount} missing ${plural(metrics.productsWithoutCapabilitiesCount, "capability")}`
        : "All mapped";

  return {
    domains: { subtext: domainsSubtext, variant: metricVariant(domainsSubtext) },
    capabilities: { subtext: capabilitiesSubtext, variant: metricVariant(capabilitiesSubtext) },
    systems: { subtext: systemsSubtext, variant: metricVariant(systemsSubtext) },
    products: { subtext: productsSubtext, variant: metricVariant(productsSubtext) },
  };
}

/** @deprecated Use metricCardStates(). */
export function metricSubtexts(metrics: WorkspaceMetrics): {
  domains: string;
  capabilities: string;
  systems: string;
  products: string;
} {
  const states = metricCardStates(metrics);
  return {
    domains: states.domains.subtext,
    capabilities: states.capabilities.subtext,
    systems: states.systems.subtext,
    products: states.products.subtext,
  };
}

export function gapDedupeKey(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("domain") && t.includes("capabilit")) return "domains-without-capabilities";
  if (t.includes("capabilit") && t.includes("system")) return "capabilities-without-system";
  if (t.includes("capabilit") && t.includes("owner")) return "capabilities-without-owner";
  if (t.includes("product") && t.includes("capabilit")) return "products-without-capabilities";
  if (t.includes("shadow") && t.includes("system")) return "shadow-systems";
  if (t.includes("investment") && t.includes("unlink")) return "investments-unlinked";
  if (t.includes("capability map not started")) return "map-not-started";
  if (t.includes("no capabilities defined")) return "no-capabilities";
  if (t.includes("no products defined")) return "no-products";
  if (t.includes("no systems registered")) return "no-systems";
  return t.replace(/\d+/g, "#").trim();
}

export function dedupeInsights(insights: AiInsight[]): AiInsight[] {
  const seen = new Set<string>();
  const result: AiInsight[] = [];
  for (const insight of insights) {
    const key = gapDedupeKey(insight.title);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(insight);
  }
  return result;
}

/** Deterministic structural gaps aligned with snapshot metrics — one row per gap type. */
export function buildStructuralGaps(metrics: WorkspaceMetrics): StructuralGap[] {
  const gaps: StructuralGap[] = [];

  if (
    metrics.domainCount === 0 &&
    metrics.capabilityCount === 0 &&
    metrics.systemCount === 0 &&
    metrics.productCount === 0
  ) {
    gaps.push({
      id: "no-systems",
      key: "no-systems",
      title: "No systems registered yet",
      subtitle: "Application · start here",
      severity: "high",
      badgeLabel: "Start here",
      description:
        "List the systems in your estate first. Group them into domains and capabilities once you can see the whole picture.",
    });
    return gaps;
  }

  if (metrics.incompleteDomainCount > 0) {
    gaps.push({
      id: "domains-without-capabilities",
      key: "domains-without-capabilities",
      title: `${metrics.incompleteDomainCount} ${plural(metrics.incompleteDomainCount, "domain")} have no capabilities`,
      subtitle: "Domain · no coverage",
      severity: "high",
      badgeLabel: `${metrics.incompleteDomainCount} ${plural(metrics.incompleteDomainCount, "domain")}`,
    });
  }

  if (metrics.capabilitiesWithoutSystemCount > 0) {
    gaps.push({
      id: "capabilities-without-system",
      key: "capabilities-without-system",
      title: `${metrics.capabilitiesWithoutSystemCount} ${plural(metrics.capabilitiesWithoutSystemCount, "capability", "capabilities")} have no realising system`,
      subtitle: "Capability · unmapped",
      severity: "high",
      badgeLabel: `${metrics.capabilitiesWithoutSystemCount} ${plural(metrics.capabilitiesWithoutSystemCount, "capability", "capabilities")}`,
    });
  }

  if (metrics.capabilitiesWithoutOwnerCount > 0) {
    gaps.push({
      id: "capabilities-without-owner",
      key: "capabilities-without-owner",
      title: `${metrics.capabilitiesWithoutOwnerCount} ${plural(metrics.capabilitiesWithoutOwnerCount, "capability", "capabilities")} have no owner assigned`,
      subtitle: "Ownership · unassigned",
      severity: "medium",
      badgeLabel: `${metrics.capabilitiesWithoutOwnerCount} ${plural(metrics.capabilitiesWithoutOwnerCount, "capability", "capabilities")}`,
    });
  }

  if (metrics.productsWithoutCapabilitiesCount > 0) {
    gaps.push({
      id: "products-without-capabilities",
      key: "products-without-capabilities",
      title: `${metrics.productsWithoutCapabilitiesCount} ${plural(metrics.productsWithoutCapabilitiesCount, "product")} reference no capabilities`,
      subtitle: "Product · operations risk",
      severity: "high",
      badgeLabel: metrics.productsWithoutCapabilitiesCount === 1 ? "At risk" : `${metrics.productsWithoutCapabilitiesCount} products`,
    });
  }

  if (metrics.shadowSystemCount > 0) {
    gaps.push({
      id: "shadow-systems",
      key: "shadow-systems",
      title: `${metrics.shadowSystemCount} shadow ${plural(metrics.shadowSystemCount, "system")} not formally tracked by IT`,
      subtitle: "Governance · ghost IT",
      severity: "medium",
      badgeLabel: `${metrics.shadowSystemCount} shadow ${plural(metrics.shadowSystemCount, "system")}`,
      description:
        "Systems discovered outside IT's sanctioned inventory — review and classify when ready.",
    });
  }

  return gaps;
}

/** Concrete structural facts for the overview — no composite score. */
export function buildStructuralSummary(metrics: WorkspaceMetrics): string | null {
  const parts: string[] = [];

  if (metrics.capabilitiesWithoutOwnerCount > 0) {
    parts.push(
      `${metrics.capabilitiesWithoutOwnerCount} ${plural(metrics.capabilitiesWithoutOwnerCount, "capability", "capabilities")} without ownership`
    );
  }
  if (metrics.capabilitiesWithoutSystemCount > 0) {
    parts.push(
      `${metrics.capabilitiesWithoutSystemCount} ${plural(metrics.capabilitiesWithoutSystemCount, "capability", "capabilities")} without a realising system`
    );
  }
  if (metrics.incompleteDomainCount > 0) {
    parts.push(
      `${metrics.incompleteDomainCount} ${plural(metrics.incompleteDomainCount, "domain")} without capabilities`
    );
  }
  if (metrics.productsWithoutCapabilitiesCount > 0) {
    parts.push(
      `${metrics.productsWithoutCapabilitiesCount} ${plural(metrics.productsWithoutCapabilitiesCount, "product")} without capability links`
    );
  }
  if (metrics.shadowSystemCount > 0) {
    parts.push(
      `${metrics.shadowSystemCount} shadow ${plural(metrics.shadowSystemCount, "system")} in the estate`
    );
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Merge AI insights for the full panel; dashboard list uses metrics-only gaps to avoid duplicates. */
export function buildDashboardInsights(
  metrics: WorkspaceMetrics,
  aiInsights: AiInsight[]
): AiInsight[] {
  const dedupedAi = dedupeInsights(aiInsights);
  const metricKeys = new Set(buildStructuralGaps(metrics).map((g) => g.key));
  const extras: AiInsight[] = [];

  for (const insight of dedupedAi) {
    if (!metricKeys.has(gapDedupeKey(insight.title))) {
      extras.push(insight);
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  const metricAsInsights: AiInsight[] = buildStructuralGaps(metrics).map((gap) => ({
    id: gap.id,
    type: "gap" as const,
    title: gap.title,
    description: gap.description ?? gap.subtitle,
    severity: gap.severity,
    affected_object_ids: [],
    created_at: new Date().toISOString(),
  }));

  return [...metricAsInsights, ...extras].sort(
    (a, b) =>
      (severityRank[a.severity ?? "low"] ?? 3) - (severityRank[b.severity ?? "low"] ?? 3)
  );
}

export function dashboardPrimaryCta(
  metrics: WorkspaceMetrics,
  basePath: string
): DashboardCta | null {
  if (metrics.systemCount === 0) {
    return {
      message:
        "List the systems in your estate first. Group them into domains and capabilities later, once you can see the whole picture.",
      actionLabel: "Add systems",
      actionHref: `${basePath}/application/applications`,
    };
  }

  if (metrics.capabilityCount > 0) return null;

  if (metrics.domainCount > 0) {
    return {
      message:
        "Add capabilities to unlock Capability heatmap and Product portfolio — your two most useful views.",
      actionLabel: "Add capabilities",
      actionHref: `${basePath}/business/capabilities`,
    };
  }

  return null;
}

const DASHBOARD_EXTRA_VIEWS: ViewConfig[] = [PROCESSES_VIEW];

export function buildZeroStateViewCards(
  basePath: string,
  metrics: WorkspaceMetrics
): DashboardViewCard[] {
  const galleryHref = `${basePath}/views`;
  const pick = (viewId: "products" | "capability-heatmap") => {
    const view = NAV_VIEWS.find((v) => v.id === viewId)!;
    const statusLabel =
      viewId === "products"
        ? metrics.systemCount === 0
          ? "Needs systems"
          : "Needs products"
        : metrics.capabilityCount === 0
          ? "Needs capabilities"
          : "Needs data";
    return {
      id: view.id,
      label: view.label,
      description: view.description,
      drawerDescription: view.drawerDescription,
      href: `${basePath}/${view.segment}`,
      galleryHref,
      ready: false,
      statusLabel,
      statusTone: "needs" as ViewStatusTone,
      iconColor: view.color,
      icon: view.icon,
    };
  };
  return [pick("products"), pick("capability-heatmap")];
}

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
  switch (viewId) {
    case "products":
      if (metrics.productCount === 0) {
        return { ready: false, statusLabel: "Add products", statusTone: "needs" };
      }
      if (metrics.productsWithoutCapabilitiesCount > 0) {
        return {
          ready: true,
          statusLabel: `${metrics.productsWithoutCapabilitiesCount} missing capabilities`,
          statusTone: "action",
        };
      }
      return {
        ready: true,
        statusLabel: `${metrics.productCount} product${metrics.productCount === 1 ? "" : "s"} · all mapped`,
        statusTone: "healthy",
      };
    case "capability-heatmap":
      if (metrics.capabilityCount === 0) {
        return { ready: false, statusLabel: "Add capabilities", statusTone: "needs" };
      }
      if (metrics.capabilitiesWithoutSystemCount > 0 || metrics.incompleteDomainCount > 0) {
        const gapCount =
          metrics.capabilitiesWithoutSystemCount + metrics.incompleteDomainCount;
        return {
          ready: true,
          statusLabel: `${gapCount} gap${gapCount === 1 ? "" : "s"} detected`,
          statusTone: "action",
        };
      }
      return { ready: true, statusLabel: "No gaps detected", statusTone: "healthy" };
    case "processes":
      return metrics.processCount > 0
        ? {
            ready: true,
            statusLabel: `${metrics.processCount} process${metrics.processCount === 1 ? "" : "es"} mapped`,
            statusTone: "healthy",
          }
        : { ready: false, statusLabel: "Needs processes", statusTone: "needs" };
    case "journeys":
      return metrics.journeyCount > 0
        ? {
            ready: true,
            statusLabel: `${metrics.journeyCount} journey${metrics.journeyCount === 1 ? "" : "s"} mapped`,
            statusTone: "healthy",
          }
        : { ready: false, statusLabel: "No journeys mapped", statusTone: "needs" };
    case "investments":
      return metrics.investmentCount > 0
        ? {
            ready: true,
            statusLabel: `${metrics.investmentCount} initiative${metrics.investmentCount === 1 ? "" : "s"} tracked`,
            statusTone: "healthy",
          }
        : { ready: false, statusLabel: "Needs investments", statusTone: "needs" };
    case "tech-debt":
      return { ready: true, statusLabel: "None open", statusTone: "healthy" };
    case "integration-health":
      return {
        ready: true,
        statusLabel: "Integration layer",
        statusTone: "healthy",
      };
    case "foundations":
      return metrics.systemCount > 0
        ? {
            ready: true,
            statusLabel: `${metrics.systemCount} system${metrics.systemCount === 1 ? "" : "s"} in estate`,
            statusTone: "healthy",
          }
        : { ready: false, statusLabel: "Add systems", statusTone: "needs" };
    default:
      return { ready: false, statusLabel: "Needs data", statusTone: "needs" };
  }
}

export const SETUP_BANNER_STORAGE_KEY = "bubo-setup-banner-dismissed";

export function setupBannerDismissKey(orgSlug: string, workspaceSlug: string): string {
  return `${SETUP_BANNER_STORAGE_KEY}:${orgSlug}:${workspaceSlug}`;
}
