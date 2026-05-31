"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Download,
  LayoutGrid,
  Table2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi, objectsApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductDetail } from "@/components/views/ProductDetail";
import { ProductIntegrationsSummary } from "@/components/views/ProductIntegrationsSummary";
import { ProductHealthDrilldown } from "@/components/views/ProductHealthDrilldown";
import {
  formatDebtCockpit,
  formatDebtSummary,
  formatProductCost,
  HEALTH_BORDER,
  HEALTH_LABEL,
  isUnowned,
  primaryAction,
  productHealthStatus,
  roadmapStatusLabel,
  sortForCockpit,
  trendIcon,
} from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";
import { useViewEmbedded, useViewsTheme } from "@/lib/view-embed-context";
import type { Product, MinEAObject, ProductHealthStatus } from "@minea/types";

const CELL_BG: Record<ProductHealthStatus, string> = {
  healthy: "bg-emerald-500",
  aging: "bg-amber-400",
  at_risk: "bg-red-500",
  no_data: "bg-gray-200",
};

const HEALTH_DOT_CLASS: Record<ProductHealthStatus, string> = {
  healthy: "bg-emerald-500",
  aging: "bg-amber-500",
  at_risk: "bg-red-500",
  no_data: "bg-gray-300",
};

const LIFECYCLE_DOT: Record<string, string> = {
  live: "bg-emerald-500",
  beta: "bg-amber-500",
  planned: "bg-gray-400",
  retiring: "bg-orange-500",
  retired: "bg-gray-300",
};

const TEAM_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ec4899",
  "#0ea5e9", "#8b5cf6", "#14b8a6", "#f97316",
];

type Lens = "action" | "ownership" | "lifecycle";

// ─── Cockpit card ──────────────────────────────────────────────────────────

function SignalPill({
  label,
  value,
  subtext,
  emphasis = false,
  valueClassName,
}: {
  label: string;
  value: string;
  subtext?: string;
  emphasis?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-stone-50 px-3 py-2 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={cn(
          "text-sm truncate mt-0.5",
          valueClassName ?? (emphasis ? "font-semibold text-gray-900" : "font-medium text-gray-700")
        )}
      >
        {value}
      </p>
      {subtext && <p className="text-[11px] text-gray-400 truncate mt-0.5">{subtext}</p>}
    </div>
  );
}

function TrendBadge({ product }: { product: Product }) {
  const direction = product.trend_direction ?? "stable";
  const label = product.trend_label ?? "No recent changes";
  const Icon =
    direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
      <Icon size={12} className="text-gray-400" />
      <span>{trendIcon(direction)} {label}</span>
    </span>
  );
}

const VISIBLE_CAPABILITIES = 4;

function CapabilityStrip({
  product,
  capabilityById,
}: {
  product: Product;
  capabilityById: Map<string, MinEAObject>;
}) {
  const linked = product.capability_ids
    .map((id) => capabilityById.get(id))
    .filter((cap): cap is MinEAObject => !!cap);

  if (linked.length === 0) return null;

  const visible = linked.slice(0, VISIBLE_CAPABILITIES);
  const overflow = linked.length - visible.length;

  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Capabilities
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((cap) => (
          <span
            key={cap.id}
            className={cn(
              "text-xs px-2 py-0.5 rounded-md bg-stone-50 text-gray-700 font-medium border border-transparent",
              cap.status === "planned" && "border-dashed border-gray-300 text-gray-500"
            )}
          >
            {cap.name}
          </span>
        ))}
      </div>
      {overflow > 0 && (
        <p className="text-[11px] font-medium text-indigo-600 mt-1.5">+ {overflow} more</p>
      )}
    </div>
  );
}

function PortfolioCard({
  product,
  teamColor,
  capabilityById,
  onClick,
}: {
  product: Product;
  teamColor: string;
  capabilityById: Map<string, MinEAObject>;
  onClick: () => void;
}) {
  const health = productHealthStatus(product);
  const unowned = isUnowned(product);
  const debt = formatDebtCockpit(product);
  const openDebt = product.open_tech_debt_count ?? 0;
  const activeRoadmaps = product.roadmap_count ?? 0;
  const footerAction =
    openDebt > 0 ? "Review tech debt register" : primaryAction(product);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "text-left bg-white rounded-xl border border-l-4 border-gray-200 p-5 w-full transition-all cursor-pointer",
        "hover:shadow-sm hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300",
        HEALTH_BORDER[health]
      )}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: teamColor }}
        >
          {product.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-base truncate">{product.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 capitalize">
            {product.owner ?? "Unassigned"} · {product.lifecycle}
          </p>
        </div>
        <ProductHealthDrilldown product={product} />
      </div>

      <CapabilityStrip product={product} capabilityById={capabilityById} />

      <div className="grid grid-cols-3 gap-2 mb-4">
        <SignalPill
          label="Tech debt"
          value={debt.value}
          subtext={debt.subtext}
          valueClassName={cn(
            "font-semibold",
            debt.critical ? "text-red-700" : debt.value === "None open" ? "text-gray-700" : "text-gray-900"
          )}
        />
        <SignalPill label="Cost / yr" value={formatProductCost(product.annual_cost_total)} />
        <SignalPill
          label="Roadmap"
          value={roadmapStatusLabel(product.roadmap_status)}
          subtext={activeRoadmaps > 0 ? `${activeRoadmaps} active` : undefined}
        />
      </div>

      <ProductIntegrationsSummary product={product} />

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <TrendBadge product={product} />
          {unowned && (
            <span className="text-[11px] text-gray-500 truncate">· No owner assigned</span>
          )}
        </div>
        <span className="text-xs font-semibold text-gray-900 truncate flex-shrink-0">
          {footerAction} →
        </span>
      </div>
    </div>
  );
}

// ─── Matrix view ──────────────────────────────────────────────────────────

function PortfolioMatrix({
  products,
  capabilities,
  onClickProduct,
}: {
  products: Product[];
  capabilities: MinEAObject[];
  onClickProduct: (p: Product) => void;
}) {
  const capUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      for (const cid of p.capability_ids) {
        counts[cid] = (counts[cid] ?? 0) + 1;
      }
    }
    return counts;
  }, [products]);

  // Show all capabilities used by any product, sorted by frequency
  const columns = useMemo(
    () =>
      capabilities
        .filter((c) => (capUsage[c.id] ?? 0) >= 1)
        .sort((a, b) => (capUsage[b.id] ?? 0) - (capUsage[a.id] ?? 0))
        .slice(0, 16),
    [capabilities, capUsage]
  );

  const mostShared = columns[0];
  const mostSharedCount = mostShared ? (capUsage[mostShared.id] ?? 0) : 0;

  const highestRiskCap = useMemo(() => {
    let worst: { cap: MinEAObject; riskCount: number } | null = null;
    for (const cap of columns) {
      const users = products.filter((p) => p.capability_ids.includes(cap.id));
      const riskCount = users.filter((p) =>
        ["at_risk", "aging"].includes(productHealthStatus(p))
      ).length;
      if (!worst || riskCount > worst.riskCount) worst = { cap, riskCount };
    }
    return worst;
  }, [columns, products]);

  const unmapped = products.filter((p) => p.capability_count === 0);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-500 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <span className="text-gray-400">ⓘ</span>
        Rows = products · Columns = capabilities · Cell = product uses this capability · Color = fitness of supporting systems
      </p>

      {/* Scrollable matrix — hug content width, scroll when many columns */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-fit max-w-full">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-max">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 bg-gray-50 z-10 text-left px-4 py-2.5 w-[200px] border-r border-gray-200">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    Product ↓ / Capability →
                  </span>
                </th>
                {columns.map((cap) => (
                  <th
                    key={cap.id}
                    className="px-2 py-2.5 text-center w-[88px]"
                    title={cap.name}
                  >
                    <span className="block text-[10px] font-semibold text-gray-600 truncate mx-auto">
                      {cap.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const health = productHealthStatus(p);
                const dotClass = LIFECYCLE_DOT[p.lifecycle] ?? "bg-gray-400";
                return (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-indigo-50/30 transition-colors">
                    <td className="sticky left-0 bg-white z-10 px-4 py-2.5 w-[200px] border-r border-gray-200">
                      <button
                        type="button"
                        onClick={() => onClickProduct(p)}
                        className="flex items-start gap-2 text-left w-full hover:text-indigo-700 transition-colors"
                      >
                        <span className={cn("h-2 w-2 rounded-full mt-1 flex-shrink-0", dotClass)} />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-xs leading-tight truncate">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-gray-400 leading-tight truncate">
                            {p.owner ?? "No team"}
                            {p.capability_count === 0 && (
                              <span className="ml-1 italic text-gray-300">· no caps mapped</span>
                            )}
                          </p>
                        </div>
                      </button>
                    </td>
                    {p.capability_count === 0 ? (
                      <td
                        colSpan={Math.max(columns.length, 1)}
                        className="px-4 py-2.5 text-[11px] text-gray-400 italic whitespace-nowrap"
                      >
                        No capabilities mapped — add from Repository
                      </td>
                    ) : (
                      columns.map((cap) => {
                        const uses = p.capability_ids.includes(cap.id);
                        return (
                          <td key={cap.id} className="px-1 py-1.5 text-center w-[88px]">
                            {uses && (
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center h-6 w-6 rounded text-white text-[10px] font-bold",
                                  CELL_BG[health]
                                )}
                              >
                                ✓
                              </span>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
              {/* Footer totals row */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="sticky left-0 bg-gray-50 z-10 px-4 py-2 w-[200px] border-r border-gray-200">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Shared by (products)
                  </span>
                </td>
                {columns.map((cap) => {
                  const count = capUsage[cap.id] ?? 0;
                  const hasRisk = products
                    .filter((p) => p.capability_ids.includes(cap.id))
                    .some((p) => productHealthStatus(p) === "at_risk");
                  return (
                    <td key={cap.id} className="text-center py-2 w-[88px]">
                      <span
                        className={cn(
                          "text-xs font-bold",
                          hasRisk ? "text-amber-700" : "text-gray-600"
                        )}
                      >
                        {count}
                        {hasRisk && (
                          <AlertTriangle size={9} className="inline ml-0.5 text-amber-500 align-middle" />
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 px-4 py-2 border-t border-gray-100 bg-gray-50">
          Grid: portfolio health at a glance · Matrix: capability overlap and shared risk · Toggle between views above
        </p>
      </div>

      {/* Insight cards — compact row, not full-bleed */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Most shared capability
          </p>
          {mostShared ? (
            <>
              <p className="font-bold text-gray-900 text-sm">{mostShared.name}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                Used by {mostSharedCount} of {products.length} products
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No shared capabilities yet</p>
          )}
        </div>

        <div
          className={cn(
            "border rounded-xl px-5 py-4",
            highestRiskCap && highestRiskCap.riskCount > 0
              ? "bg-red-50 border-red-200"
              : "bg-white border-gray-200"
          )}
        >
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-2">
            Highest shared risk
          </p>
          {highestRiskCap && highestRiskCap.riskCount > 0 ? (
            <>
              <p className="font-bold text-red-900 text-sm">{highestRiskCap.cap.name}</p>
              <p className="text-[11px] text-red-600 mt-1">
                At-risk · {highestRiskCap.riskCount} product
                {highestRiskCap.riskCount === 1 ? "" : "s"} depend on it
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No at-risk shared capabilities</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Unmapped product{unmapped.length !== 1 ? "s" : ""}
          </p>
          {unmapped.length > 0 ? (
            <>
              <p className="font-bold text-gray-900 text-sm">{unmapped[0]!.name}</p>
              <p className="text-[11px] text-indigo-600 mt-1">
                {unmapped.length > 1
                  ? `+${unmapped.length - 1} more need mapping`
                  : "Map capabilities →"}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-600 font-medium">All products mapped ✓</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function PortfolioView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const embedded = useViewEmbedded();
  const isViewsMode = useViewsTheme();

  const shellClass = cn(
    "mx-auto w-full",
    embedded ? "px-4 pt-4" : "max-w-6xl px-8 pt-8"
  );

  const [layout, setLayout] = useState<"grid" | "matrix">("grid");
  const [lens, setLens] = useState<Lens>("action");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(TEAM_COLORS[0]!);

  const { data, isLoading } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
  });

  const { data: capsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "capability"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!);
    },
    enabled: !!data,
  });

  const products = useMemo(() => data?.items ?? [], [data]);
  const capabilities = capsData?.items ?? [];

  const capabilityById = useMemo(() => {
    const map = new Map<string, MinEAObject>();
    for (const cap of capabilities) map.set(cap.id, cap);
    return map;
  }, [capabilities]);

  // Aggregate stats
  const healthCounts = useMemo(() => {
    const c = { healthy: 0, aging: 0, at_risk: 0, no_data: 0 };
    for (const p of products) c[productHealthStatus(p)]++;
    return c;
  }, [products]);

  const unownedCount = useMemo(() => products.filter(isUnowned).length, [products]);

  const lastUpdated = useMemo(() => {
    if (!products.length) return null;
    const ts = Math.max(...products.map((p) => new Date(p.updated_at).getTime()));
    const diffH = Math.round((Date.now() - ts) / 3_600_000);
    if (diffH < 1) return "just now";
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
  }, [products]);

  // Team → color
  const teamColorMap = useMemo(() => {
    const owners = [...new Set(products.map((p) => p.owner ?? ""))];
    const map: Record<string, string> = {};
    owners.forEach((o, i) => {
      map[o] = TEAM_COLORS[i % TEAM_COLORS.length]!;
    });
    return map;
  }, [products]);

  // Grouping for Grid
  const gridGroups = useMemo(() => {
    if (lens === "action") {
      const sorted = sortForCockpit(products);
      const needsAction = sorted.filter((p) => productHealthStatus(p) !== "healthy" || isUnowned(p));
      const stable = sorted.filter((p) => productHealthStatus(p) === "healthy" && !isUnowned(p));
      const groups = [];
      if (needsAction.length) {
        groups.push({ key: "action", label: "Needs your attention", items: needsAction });
      }
      if (stable.length) {
        groups.push({ key: "stable", label: "Stable", items: stable });
      }
      return groups.length ? groups : [{ key: "all", label: "Products", items: sorted }];
    }
    if (lens === "ownership") {
      const owners = [...new Set(products.map((p) => p.owner ?? "Unassigned"))].sort((a, b) => {
        if (a === "Unassigned") return -1;
        if (b === "Unassigned") return 1;
        return a.localeCompare(b);
      });
      return owners.map((o) => ({
        key: o,
        label: o,
        items: sortForCockpit(products.filter((p) => (p.owner ?? "Unassigned") === o)),
      }));
    }
    const stages = ["live", "beta", "planned", "retiring", "retired"];
    return stages
      .map((s) => ({
        key: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
        items: sortForCockpit(products.filter((p) => p.lifecycle === s)),
      }))
      .filter((g) => g.items.length > 0);
  }, [products, lens]);

  const refreshProducts = () => {
    invalidateProductQueries(queryClient, orgSlug, workspaceSlug, selectedProductId ?? undefined);
  };

  const openProduct = (p: Product) => {
    const color = teamColorMap[p.owner ?? ""] ?? TEAM_COLORS[0]!;
    setSelectedColor(color);
    setSelectedProductId(p.id);
  };

  const exportCSV = () => {
    const rows = [
      ["Name", "Team", "Lifecycle", "Health", "Tech debt", "Cost/yr", "Roadmap", "Trend"],
    ];
    for (const p of products) {
      rows.push([
        p.name,
        p.owner ?? "",
        p.lifecycle,
        HEALTH_LABEL[productHealthStatus(p)],
        formatDebtSummary(p),
        formatProductCost(p.annual_cost_total),
        roadmapStatusLabel(p.roadmap_status),
        p.trend_label ?? "",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "portfolio.csv";
    a.click();
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="p-8 max-w-6xl">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center max-w-lg mx-auto mt-12">
          <div className="h-12 w-12 rounded-lg mx-auto mb-4 flex items-center justify-center bg-indigo-50">
            <LayoutGrid size={22} className="text-indigo-600" />
          </div>
          <h2 className="font-semibold text-gray-900 mb-2">No products yet</h2>
          <p className="text-sm text-gray-500 mb-6">
            Add products and map them to capabilities to see the portfolio landscape — health, shared risks, and ownership gaps.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            Add your first product
          </button>
        </div>
        {showCreateForm && (
          <ProductForm
            onClose={() => setShowCreateForm(false)}
            onSuccess={() => { setShowCreateForm(false); refreshProducts(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Page header ── */}
      <div className={cn(shellClass, "pb-0 flex-shrink-0")}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p
              className={cn(
                "text-xs mb-1 uppercase tracking-wider",
                isViewsMode ? "text-violet-400" : "text-gray-400"
              )}
            >
              Views · Portfolio
            </p>
            <h1 className="text-2xl font-bold text-gray-900">Products portfolio</h1>
            <p className={cn("text-sm mt-1", isViewsMode ? "text-violet-500" : "text-gray-500")}>
              {products.length} product{products.length === 1 ? "" : "s"} · cockpit view
              {unownedCount > 0 && ` · ${unownedCount} unowned`}
              {lastUpdated && ` · updated ${lastUpdated}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Add
            </button>
            <button
              type="button"
              onClick={exportCSV}
              className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 transition-colors"
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </div>

        {/* Toggle row */}
        <div
          className={cn(
            "flex items-center gap-3 flex-wrap pb-5 border-b",
            isViewsMode ? "border-violet-200/60" : "border-gray-200"
          )}
        >
          {/* Grid / Matrix toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(["grid", "matrix"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLayout(l)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  layout === l
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {l === "grid" ? <LayoutGrid size={12} /> : <Table2 size={12} />}
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>

          {layout === "grid" && (
            <>
              {/* Lens selector */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
                  Lens
                </span>
                {(
                  [
                    ["action", "Action needed"],
                    ["ownership", "Ownership"],
                    ["lifecycle", "Lifecycle"],
                  ] as [Lens, string][]
                ).map(([l, label]) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLens(l)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                      lens === l
                        ? "bg-gray-900 text-white border-gray-900"
                        : "text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900 bg-white"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 ml-auto">
                {(["healthy", "aging", "at_risk", "no_data"] as ProductHealthStatus[]).map((h) => (
                  <span key={h} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <span className={cn("h-2.5 w-2.5 rounded", HEALTH_DOT_CLASS[h])} />
                    {HEALTH_LABEL[h]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className={cn(shellClass, "flex-1 py-6")}>
        {layout === "grid" ? (
          <div className="space-y-8 max-w-3xl">
            {gridGroups.map((group) => (
              <section key={group.key}>
                {gridGroups.length > 1 && (
                  <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    {group.label}
                  </h2>
                )}
                <div className="grid grid-cols-1 gap-4">
                  {group.items.map((p) => (
                    <PortfolioCard
                      key={p.id}
                      product={p}
                      teamColor={teamColorMap[p.owner ?? ""] ?? TEAM_COLORS[0]!}
                      capabilityById={capabilityById}
                      onClick={() => openProduct(p)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <PortfolioMatrix
            products={products}
            capabilities={capabilities}
            onClickProduct={openProduct}
          />
        )}
      </div>

      {/* ── Summary footer bar ── */}
      <div className={cn(shellClass, "flex-shrink-0 border-t border-gray-200 bg-white py-3 flex items-center gap-5 flex-wrap text-sm text-gray-500")}>
        {(["healthy", "aging", "at_risk", "no_data"] as ProductHealthStatus[]).map((h) => {
          const count = healthCounts[h];
          if (count === 0) return null;
          return (
            <span key={h} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT_CLASS[h])} />
              {count} {HEALTH_LABEL[h].toLowerCase()}
            </span>
          );
        })}
        {unownedCount > 0 && (
          <span className="ml-auto text-xs text-gray-500">
            {unownedCount} unowned
          </span>
        )}
      </div>

      {/* ── Drawers ── */}
      {showCreateForm && (
        <ProductForm
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
            refreshProducts();
          }}
        />
      )}

      {selectedProductId && (
        <ProductDetail
          productId={selectedProductId}
          accentColor={selectedColor}
          onClose={() => setSelectedProductId(null)}
          onUpdate={refreshProducts}
        />
      )}
    </div>
  );
}
