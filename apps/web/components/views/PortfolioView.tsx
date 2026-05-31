"use client";

import { useState, useMemo, type MouseEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Download,
  LayoutGrid,
  List,
  Map as MapIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
} from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi, objectsApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductDetail } from "@/components/views/ProductDetail";
import { ProductIntegrationsSummary } from "@/components/views/ProductIntegrationsSummary";
import { PortfolioTable } from "@/components/views/PortfolioTable";
import { PortfolioCapabilityMap } from "@/components/views/PortfolioCapabilityMap";
import { ProductHealthDrilldown } from "@/components/views/ProductHealthDrilldown";
import {
  formatCompactDebt,
  formatCompactIntegrationHint,
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

const HEALTH_DOT_CLASS: Record<ProductHealthStatus, string> = {
  healthy: "bg-emerald-500",
  aging: "bg-amber-500",
  at_risk: "bg-red-500",
  no_data: "bg-gray-300",
};

const TEAM_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ec4899",
  "#0ea5e9", "#8b5cf6", "#14b8a6", "#f97316",
];

type PortfolioLayout = "grid" | "table" | "capability-map";

const LAYOUT_OPTIONS: {
  id: PortfolioLayout;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "table", label: "Table", icon: List },
  { id: "capability-map", label: "Map", icon: MapIcon },
];

// ─── Cockpit card ──────────────────────────────────────────────────────────
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

const VISIBLE_CAPABILITIES = 3;

function CompactCapabilityTags({
  product,
  capabilityById,
  expanded,
}: {
  product: Product;
  capabilityById: Map<string, MinEAObject>;
  expanded?: boolean;
}) {
  const linked = product.capability_ids
    .map((id) => capabilityById.get(id))
    .filter((cap): cap is MinEAObject => !!cap);

  if (linked.length === 0) return null;

  const visible = expanded ? linked : linked.slice(0, VISIBLE_CAPABILITIES);
  const overflow = linked.length - VISIBLE_CAPABILITIES;

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {visible.map((cap) => (
        <span
          key={cap.id}
          className={cn(
            "text-xs px-2 py-0.5 rounded-md bg-stone-100 text-gray-700 font-medium",
            cap.status === "planned" && "border border-dashed border-gray-300 text-gray-500 bg-white"
          )}
        >
          {cap.name}
        </span>
      ))}
      {!expanded && overflow > 0 && (
        <span className="text-xs px-1.5 py-0.5 font-semibold text-indigo-600">+{overflow}</span>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex-1 min-w-0 px-4 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn("text-sm font-semibold truncate mt-0.5", valueClassName ?? "text-gray-900")}>
        {value}
      </p>
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
  const [expanded, setExpanded] = useState(false);
  const health = productHealthStatus(product);
  const unowned = isUnowned(product);
  const debt = formatCompactDebt(product);
  const openDebt = product.open_tech_debt_count ?? 0;
  const footerAction = openDebt > 0 ? "Review tech debt register" : primaryAction(product);

  const toggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div
      className={cn(
        "text-left bg-white rounded-xl border border-gray-200 w-full transition-all",
        "hover:shadow-sm hover:border-gray-300",
        HEALTH_BORDER[health]
      )}
    >
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
        className="p-4 pb-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded-t-xl"
      >
        <div className="flex items-start gap-3">
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
            style={{ backgroundColor: teamColor }}
          >
            {product.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-[15px] leading-tight truncate">
              {product.name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate capitalize">
              {product.owner ?? "Unassigned"} · {product.lifecycle} ·{" "}
              <span className="text-gray-400">{formatCompactIntegrationHint(product)}</span>
            </p>
          </div>
          <ProductHealthDrilldown product={product} className="flex-shrink-0" />
        </div>

        <CompactCapabilityTags
          product={product}
          capabilityById={capabilityById}
          expanded={expanded}
        />
      </div>

      <div className="flex items-stretch border-t border-gray-100 bg-stone-50/80 rounded-b-xl overflow-hidden">
        <MetricCell
          label="Debt"
          value={debt.value}
          valueClassName={debt.critical ? "text-red-600" : "text-gray-900"}
        />
        <div className="w-px bg-gray-200 self-stretch my-2" />
        <MetricCell label="Cost" value={formatProductCost(product.annual_cost_total)} />
        <div className="w-px bg-gray-200 self-stretch my-2" />
        <button
          type="button"
          onClick={toggleExpand}
          className="flex-[1.2] min-w-0 flex items-center justify-center gap-1 px-2 py-2.5 hover:bg-stone-100/80 transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse product details" : "Expand product details"}
        >
          <div className="min-w-0 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Roadmap
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">
              {roadmapStatusLabel(product.roadmap_status)}
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "text-gray-400 flex-shrink-0 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-3">
          <ProductIntegrationsSummary product={product} />
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 min-w-0">
              <TrendBadge product={product} />
              {unowned && (
                <span className="text-[11px] text-gray-500 truncate">· No owner assigned</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClick}
              className="text-xs font-semibold text-gray-900 truncate flex-shrink-0 hover:text-indigo-600"
            >
              {footerAction} →
            </button>
          </div>
        </div>
      )}
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

  const [layout, setLayout] = useState<PortfolioLayout>("grid");
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

  // Grouping for Grid — needs attention first, then stable
  const gridGroups = useMemo(() => {
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
  }, [products]);

  const refreshProducts = () => {
    invalidateProductQueries(queryClient, orgSlug, workspaceSlug, selectedProductId ?? undefined);
  };

  const openProduct = (p: Product) => {
    const color = teamColorMap[p.owner ?? ""] ?? TEAM_COLORS[0]!;
    setSelectedColor(color);
    setSelectedProductId(p.id);
  };

  const openProductById = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) openProduct(product);
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
          {/* Grid / Table / Matrix toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {LAYOUT_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayout(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  layout === id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
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
        ) : layout === "table" ? (
          <PortfolioTable
            products={products}
            teamColorMap={teamColorMap}
            onClickProduct={openProduct}
          />
        ) : (
          <PortfolioCapabilityMap products={products} onProductClick={openProductById} />
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
