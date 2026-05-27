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
  Users,
} from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi, objectsApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductDetail } from "@/components/views/ProductDetail";
import { cn } from "@/lib/utils";
import { useViewEmbedded } from "@/lib/view-embed-context";
import type { Product, MinEAObject } from "@minea/types";

// ─── Health scoring ────────────────────────────────────────────────────────

type HealthStatus = "healthy" | "aging" | "at_risk" | "no_data";

function productHealth(p: Product): HealthStatus {
  if (p.capability_count === 0) return "no_data";
  if (p.lifecycle === "retired") return "aging";
  if (p.maturity_indicator === "manual" && p.system_count >= 3) return "at_risk";
  if (p.lifecycle === "retiring" || p.maturity_indicator === "manual") return "aging";
  return "healthy";
}

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  aging: "Aging",
  at_risk: "At risk",
  no_data: "No data",
};

const HEALTH_CHIP: Record<HealthStatus, string> = {
  healthy: "bg-emerald-100 text-emerald-700",
  aging: "bg-amber-100 text-amber-700",
  at_risk: "bg-red-100 text-red-700",
  no_data: "bg-gray-100 text-gray-500",
};

const HEALTH_BORDER: Record<HealthStatus, string> = {
  healthy: "border-l-emerald-400",
  aging: "border-l-amber-400",
  at_risk: "border-l-red-400",
  no_data: "border-l-gray-300",
};

const HEALTH_DOT_CLASS: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  aging: "bg-amber-500",
  at_risk: "bg-red-500",
  no_data: "bg-gray-300",
};

const CELL_BG: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  aging: "bg-amber-400",
  at_risk: "bg-red-500",
  no_data: "bg-gray-200",
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

type Lens = "health" | "ownership" | "lifecycle";

// ─── Stat box ─────────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center flex-1">
      <p className="text-sm font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
    </div>
  );
}

// ─── Portfolio card (Grid view) ────────────────────────────────────────────

function PortfolioCard({
  product,
  health,
  teamColor,
  onClick,
}: {
  product: Product;
  health: HealthStatus;
  teamColor: string;
  onClick: () => void;
}) {
  const alertText =
    health === "at_risk"
      ? `${product.system_count} systems · legacy risk`
      : product.lifecycle === "retiring"
      ? "Retiring · action may be needed"
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left bg-white rounded-xl border border-gray-200 border-l-4 p-4",
        "hover:shadow-md hover:border-gray-300 transition-all w-full",
        HEALTH_BORDER[health]
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 select-none"
          style={{ backgroundColor: teamColor }}
        >
          {product.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
            {product.name}
          </p>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            {product.owner ?? "No team"} · <span className="capitalize">{product.lifecycle}</span>
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 self-start",
            HEALTH_CHIP[health]
          )}
        >
          {HEALTH_LABEL[health]}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-3 py-2 mb-3">
        <StatBox label="capabilities" value={product.capability_count} />
        <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
        <StatBox label="systems" value={product.system_count} />
        <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
        <StatBox label="APIs" value={product.api_count} />
      </div>

      {/* Footer alert / owner */}
      {alertText ? (
        <p className="flex items-center gap-1 text-[11px] text-amber-700 font-medium">
          <AlertTriangle size={10} className="flex-shrink-0" />
          {alertText}
        </p>
      ) : product.owner ? (
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Users size={10} className="flex-shrink-0" />
          {product.owner}
        </p>
      ) : (
        <p className="text-[11px] text-gray-300 italic">No owner assigned</p>
      )}
    </button>
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
        ["at_risk", "aging"].includes(productHealth(p))
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
                const health = productHealth(p);
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
                    .some((p) => productHealth(p) === "at_risk");
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

  const shellClass = cn(
    "mx-auto w-full",
    embedded ? "px-4 pt-4" : "max-w-6xl px-8 pt-8"
  );

  const [layout, setLayout] = useState<"grid" | "matrix">("grid");
  const [lens, setLens] = useState<Lens>("health");
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
    enabled: layout === "matrix" && !!data,
  });

  const products = useMemo(() => data?.items ?? [], [data]);
  const capabilities = capsData?.items ?? [];

  // Aggregate stats
  const healthCounts = useMemo(() => {
    const c = { healthy: 0, aging: 0, at_risk: 0, no_data: 0 };
    for (const p of products) c[productHealth(p)]++;
    return c;
  }, [products]);

  const teamCount = useMemo(
    () => new Set(products.map((p) => p.owner).filter(Boolean)).size,
    [products]
  );

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
    if (lens === "health") {
      const order: HealthStatus[] = ["at_risk", "aging", "no_data", "healthy"];
      return order
        .map((h) => ({
          key: h,
          label: HEALTH_LABEL[h],
          items: products.filter((p) => productHealth(p) === h),
        }))
        .filter((g) => g.items.length > 0);
    }
    if (lens === "ownership") {
      const owners = [...new Set(products.map((p) => p.owner ?? "No team"))].sort();
      return owners.map((o) => ({
        key: o,
        label: o,
        items: products.filter((p) => (p.owner ?? "No team") === o),
      }));
    }
    // lifecycle
    const stages = ["live", "beta", "planned", "retiring", "retired"];
    return stages
      .map((s) => ({
        key: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
        items: products.filter((p) => p.lifecycle === s),
      }))
      .filter((g) => g.items.length > 0);
  }, [products, lens]);

  const mostAtRisk = products.find((p) => productHealth(p) === "at_risk");

  const refreshProducts = () => {
    invalidateProductQueries(queryClient, orgSlug, workspaceSlug, selectedProductId ?? undefined);
  };

  const openProduct = (p: Product) => {
    const color = teamColorMap[p.owner ?? ""] ?? TEAM_COLORS[0]!;
    setSelectedColor(color);
    setSelectedProductId(p.id);
  };

  const exportCSV = () => {
    const rows = [["Name", "Team", "Lifecycle", "Health", "Capabilities", "Systems", "APIs"]];
    for (const p of products) {
      rows.push([
        p.name,
        p.owner ?? "",
        p.lifecycle,
        HEALTH_LABEL[productHealth(p)],
        String(p.capability_count),
        String(p.system_count),
        String(p.api_count),
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
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">
              Views · Portfolio
            </p>
            <h1 className="text-2xl font-bold text-gray-900">Products portfolio</h1>
            <p className="text-sm text-gray-500 mt-1">
              {products.length} product{products.length === 1 ? "" : "s"} ·{" "}
              {teamCount} team{teamCount === 1 ? "" : "s"}
              {lastUpdated && ` · last updated ${lastUpdated}`}
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
        <div className="flex items-center gap-3 flex-wrap pb-5 border-b border-gray-200">
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
                    ["health", "System health"],
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
                {(["healthy", "aging", "at_risk", "no_data"] as HealthStatus[]).map((h) => (
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
          <div className="space-y-7 max-w-5xl">
            {gridGroups.map((group) => (
              <section key={group.key}>
                {gridGroups.length > 1 && (
                  <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    {group.label}
                  </h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.items.map((p) => (
                    <PortfolioCard
                      key={p.id}
                      product={p}
                      health={productHealth(p)}
                      teamColor={teamColorMap[p.owner ?? ""] ?? TEAM_COLORS[0]!}
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
      <div className={cn(shellClass, "flex-shrink-0 border-t border-gray-200 bg-white py-3 flex items-center gap-5 flex-wrap")}>
        {(["healthy", "aging", "at_risk", "no_data"] as HealthStatus[]).map((h) => {
          const count = healthCounts[h];
          if (count === 0) return null;
          return (
            <span
              key={h}
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                h === "at_risk"
                  ? "text-red-600"
                  : h === "aging"
                  ? "text-amber-600"
                  : h === "healthy"
                  ? "text-emerald-600"
                  : "text-gray-400"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT_CLASS[h])} />
              {count} {HEALTH_LABEL[h].toLowerCase()}
            </span>
          );
        })}

        {mostAtRisk && (
          <button
            type="button"
            onClick={() => openProduct(mostAtRisk)}
            className="ml-auto flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-100 transition-colors"
          >
            <AlertTriangle size={12} />1 product needs immediate action · {mostAtRisk.name}
          </button>
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
