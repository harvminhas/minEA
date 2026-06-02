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
}

export interface DashboardViewCard {
  id: string;
  label: string;
  description: string;
  href: string;
  ready: boolean;
  statusLabel: string;
  iconColor: string;
  icon: LucideIcon;
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
  insights: AiInsight[]
): {
  domains: string;
  capabilities: string;
  systems: string;
  products: string;
} {
  const emptyDomains = countInsight(insights, "domain", "no capabilities");
  const capsNoSystem = countInsight(insights, "capabilit", "no system");
  const productsNoCaps = countInsight(insights, "product", "no capabilit");
  const unlinkedInvestments = countInsight(insights, "investment", "unlinked");

  const domains =
    metrics.domainCount === 0
      ? "none yet"
      : emptyDomains > 0
        ? `${emptyDomains} incomplete`
        : "all defined";

  const capabilities =
    metrics.capabilityCount === 0
      ? "none yet"
      : capsNoSystem > 0
        ? `${capsNoSystem} unmapped`
        : "all mapped";

  const systems =
    metrics.systemCount === 0 ? "none yet" : capsNoSystem > 0 ? `${capsNoSystem} gaps` : "all mapped";

  const products =
    metrics.productCount === 0
      ? "none yet"
      : productsNoCaps > 0
        ? `${productsNoCaps} incomplete`
        : unlinkedInvestments > 0
          ? `${unlinkedInvestments} with gaps`
          : "all mapped";

  return { domains, capabilities, systems, products };
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

  return allViews.map((view) => {
    const { ready, needs } = viewReadiness(view.id, metrics);
    return {
      id: view.id,
      label: view.label,
      description: view.description,
      href: `${basePath}/${view.segment}`,
      ready,
      statusLabel: ready ? "Ready" : needs,
      iconColor: view.color,
      icon: view.icon,
    };
  });
}

function viewReadiness(
  viewId: ViewId | "processes",
  metrics: WorkspaceMetrics
): { ready: boolean; needs: string } {
  switch (viewId) {
    case "products":
      return metrics.productCount > 0
        ? { ready: true, needs: "" }
        : { ready: false, needs: "Needs products" };
    case "capability-heatmap":
      return metrics.capabilityCount > 0
        ? { ready: true, needs: "" }
        : { ready: false, needs: "Needs capabilities" };
    case "processes":
      return metrics.processCount > 0
        ? { ready: true, needs: "" }
        : { ready: false, needs: "Needs processes" };
    case "journeys":
      return metrics.journeyCount > 0
        ? { ready: true, needs: "" }
        : { ready: false, needs: "Needs journeys" };
    case "investments":
      return metrics.investmentCount > 0
        ? { ready: true, needs: "" }
        : { ready: false, needs: "Needs investments" };
    default:
      return { ready: false, needs: "Needs data" };
  }
}

export const SETUP_BANNER_STORAGE_KEY = "bubo-setup-banner-dismissed";

export function setupBannerDismissKey(orgSlug: string, workspaceSlug: string): string {
  return `${SETUP_BANNER_STORAGE_KEY}:${orgSlug}:${workspaceSlug}`;
}
