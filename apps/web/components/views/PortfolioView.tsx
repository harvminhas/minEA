"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Download,
  LayoutGrid,
  List,
  Map as MapIcon,
} from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi } from "@/lib/api-client";
import { useViewDataGate } from "@/lib/use-view-summary";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductCard } from "@/components/views/ProductCard";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductDetail } from "@/components/views/ProductDetail";
import { PortfolioTable } from "@/components/views/PortfolioTable";
import { PortfolioArchitectureMap } from "@/components/views/PortfolioArchitectureMap";
import {
  formatDebtSummary,
  formatProductCost,
  HEALTH_LABEL,
  isUnowned,
  productHealthStatus,
  roadmapStatusLabel,
  sortForCockpit,
} from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";
import { useViewEmbedded, useViewsTheme } from "@/lib/view-embed-context";
import { useShareSession } from "@/lib/share-context";
import { ShareButton } from "@/components/share/ShareButton";
import { usePermissions } from "@/lib/use-permissions";
import type { Product, ProductHealthStatus } from "@minea/types";

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

// ─── Main component ────────────────────────────────────────────────────────

export function PortfolioView() {
  const { canCreate, canShare } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, summaryPending, showEmptyFromSummary, skipHeavyFetch } =
    useViewDataGate("products");
  const queryClient = useQueryClient();
  const embedded = useViewEmbedded();
  const shareSession = useShareSession();
  const isViewsMode = useViewsTheme();
  const showPageHeader = !embedded || !!shareSession;

  const [layout, setLayout] = useState<PortfolioLayout>("table");

  const isMapLayout = layout === "capability-map";
  const shellClass = cn(
    "mx-auto w-full",
    embedded ? "px-4 pt-4" : isMapLayout ? "px-4 sm:px-6 pt-8" : "max-w-6xl px-8 pt-8"
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(TEAM_COLORS[0]!);

  const { data, isLoading } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled: !skipHeavyFetch,
  });

  const listLoading = !skipHeavyFetch && isLoading;

  const products = useMemo(() => data?.items ?? [], [data]);

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

  if (summaryPending || listLoading) {
    return (
      <div className="p-8 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (showEmptyFromSummary || products.length === 0) {
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
          {canCreate && !isViewsMode && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md"
            >
              Add your first product
            </button>
          )}
        </div>
        {canCreate && !isViewsMode && showCreateForm && (
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
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {showPageHeader && (
              <>
                <p
                  className={cn(
                    "text-xs mb-1 uppercase tracking-wider",
                    isViewsMode ? "text-violet-400" : "text-gray-400"
                  )}
                >
                  Views · Portfolio
                </p>
                <h1 className="text-2xl font-bold text-gray-900">Products portfolio</h1>
              </>
            )}
            <p
              className={cn(
                showPageHeader ? "text-sm mt-1" : "text-sm",
                isViewsMode ? "text-violet-500" : "text-gray-500"
              )}
            >
              {shareSession ? (
                <>
                  {shareSession.orgName ?? shareSession.orgSlug}
                  {" · "}
                  {shareSession.workspaceName ?? shareSession.workspaceSlug}
                  {shareSession.sharedByName && ` · Shared by ${shareSession.sharedByName}`}
                  {lastUpdated && ` · Updated ${lastUpdated}`}
                </>
              ) : (
                <>
                  {products.length} product{products.length === 1 ? "" : "s"} · cockpit view
                  {unownedCount > 0 && ` · ${unownedCount} unowned`}
                  {lastUpdated && ` · updated ${lastUpdated}`}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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
            {canShare && (
              <ShareButton
                resourceType="view"
                resourceKey="views/products"
                title="Product portfolio"
              />
            )}
            {canCreate && !isViewsMode && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                Add
              </button>
            )}
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
      </div>

      {/* ── Content ── */}
      <div className={cn(shellClass, "flex-1 pt-2 pb-6")}>
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
                    <ProductCard
                      key={p.id}
                      product={p}
                      color={teamColorMap[p.owner ?? ""] ?? TEAM_COLORS[0]!}
                      selected={selectedProductId === p.id}
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
          <PortfolioArchitectureMap products={products} onProductClick={openProductById} />
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
      {canCreate && !isViewsMode && showCreateForm && (
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
