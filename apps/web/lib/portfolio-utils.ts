import type { Product, ProductHealthFactor, ProductHealthStatus } from "@minea/types";
import { formatCurrency } from "@/lib/utils";
import { ROADMAP_STATUS_LABEL } from "@/lib/roadmap-utils";

export const HEALTH_LABEL: Record<ProductHealthStatus, string> = {
  healthy: "Healthy",
  aging: "Needs attention",
  at_risk: "At risk",
  no_data: "Insufficient data",
};

export const HEALTH_CHIP: Record<ProductHealthStatus, string> = {
  healthy: "bg-emerald-100 text-emerald-800 border-emerald-200",
  aging: "bg-amber-100 text-amber-800 border-amber-200",
  at_risk: "bg-red-100 text-red-800 border-red-200",
  no_data: "bg-gray-100 text-gray-600 border-gray-200",
};

export const HEALTH_BORDER: Record<ProductHealthStatus, string> = {
  healthy: "border-l-emerald-500",
  aging: "border-l-amber-500",
  at_risk: "border-l-red-500",
  no_data: "border-l-gray-300",
};

export function productHealthStatus(product: Product): ProductHealthStatus {
  return (product.health_status as ProductHealthStatus) ?? "no_data";
}

export function isUnowned(product: Product): boolean {
  return !product.owner?.trim();
}

/** Cockpit priority — lower sorts first (most urgent). */
export function cockpitPriority(product: Product): number {
  if (isUnowned(product)) return 0;
  const health = productHealthStatus(product);
  if (health === "at_risk") return 1;
  if (health === "aging") return 2;
  if (health === "no_data") return 3;
  return 4;
}

export function sortForCockpit(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const pa = cockpitPriority(a);
    const pb = cockpitPriority(b);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

export function primaryAction(product: Product): string {
  const factors = product.health_factors ?? [];
  const critical = factors.find((f) => f.severity === "critical");
  if (critical) return critical.action;
  const warning = factors.find((f) => f.severity === "warning");
  if (warning) return warning.action;
  return factors[0]?.action ?? "Review product";
}

export function roadmapStatusLabel(status?: string | null): string {
  if (!status) return "None";
  return ROADMAP_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

export function formatProductCost(total?: number | null): string {
  if (total == null || total <= 0) return "—";
  return formatCurrency(total);
}

export function formatDebtSummary(product: Product): string {
  const open = product.open_tech_debt_count ?? 0;
  const critical = product.critical_tech_debt_count ?? 0;
  if (open === 0) return "None open";
  if (critical > 0) return `${open} open · ${critical} critical`;
  return `${open} open`;
}

/** Cockpit card — main debt value and optional critical subtext. */
export function formatDebtCockpit(product: Product): { value: string; subtext?: string; critical: boolean } {
  const open = product.open_tech_debt_count ?? 0;
  const critical = product.critical_tech_debt_count ?? 0;
  if (open === 0) return { value: "None open", critical: false };
  return {
    value: `${open} open`,
    subtext: critical > 0 ? `${critical} critical` : undefined,
    critical: critical > 0,
  };
}

export function formatProvidesSummary(product: Product): string {
  const apis = product.apis_provided_count ?? 0;
  const events = product.events_produced_count ?? 0;
  return `${apis} API${apis === 1 ? "" : "s"} · ${events} event${events === 1 ? "" : "s"}`;
}

export function formatDependsSummary(product: Product): string {
  const apis = product.apis_consumed_count ?? 0;
  const events = product.events_subscribed_count ?? 0;
  return `${apis} API${apis === 1 ? "" : "s"} · ${events} event${events === 1 ? "" : "s"}`;
}

export function trendIcon(direction?: string): string {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    case "neutral":
      return "↻";
    default:
      return "—";
  }
}

export function factorSeverityStyle(severity: ProductHealthFactor["severity"]): string {
  switch (severity) {
    case "critical":
      return "text-red-700 bg-red-50 border-red-100";
    case "warning":
      return "text-amber-800 bg-amber-50 border-amber-100";
    case "info":
      return "text-blue-700 bg-blue-50 border-blue-100";
    default:
      return "text-emerald-700 bg-emerald-50 border-emerald-100";
  }
}

/** Compressed coverage line for product cards and drawer properties. */
export function formatProductCoverageLine(product: Product): string {
  const systems = product.system_count ?? 0;
  const apisProvided = product.apis_provided_count ?? 0;
  const apisConsumed = product.apis_consumed_count ?? 0;
  const stores = product.data_store_count ?? 0;
  return `${systems} system${systems === 1 ? "" : "s"} · ${apisProvided} API${apisProvided === 1 ? "" : "s"} provided · ${apisConsumed} consumed · ${stores} data store${stores === 1 ? "" : "s"}`;
}
