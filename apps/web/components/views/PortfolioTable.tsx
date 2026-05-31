"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { Product, ProductHealthStatus } from "@minea/types";
import {
  formatCompactDebt,
  formatProductCost,
  HEALTH_CHIP,
  isUnowned,
  productHealthStatus,
  roadmapStatusLabel,
  sortForCockpit,
  tableHealthLabel,
} from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";

type SortKey = "name" | "health" | "owner" | "debt" | "cost" | "roadmap";

const LIFECYCLE_SUBTITLE: Record<string, string> = {
  live: "Active",
  beta: "Beta",
  planned: "Planned",
  retiring: "Retiring",
  retired: "Retired",
};

const ROW_ACCENT: Record<ProductHealthStatus, string> = {
  healthy: "border-l-emerald-500",
  aging: "border-l-amber-500",
  at_risk: "border-l-red-500",
  no_data: "border-l-gray-300",
};

function productSubtitle(product: Product): string {
  if (isUnowned(product)) {
    const days = Math.max(
      0,
      Math.floor((Date.now() - new Date(product.created_at).getTime()) / 86_400_000)
    );
    return `Unowned ${days}d`;
  }
  return LIFECYCLE_SUBTITLE[product.lifecycle] ?? product.lifecycle;
}

function formatTableRoadmap(product: Product): string {
  const count = product.roadmap_count ?? 0;
  if (count === 0) return "—";
  const status = product.roadmap_status;
  if (status === "in_progress") return `${count} in flight`;
  if (status === "planned") return `${count} planned`;
  return roadmapStatusLabel(status);
}

function healthSortRank(product: Product): number {
  const factors = product.health_factors ?? [];
  if (factors.some((f) => f.severity === "critical")) return 0;
  const status = productHealthStatus(product);
  if (status === "at_risk") return 1;
  if (status === "aging") return 2;
  if (status === "no_data") return 3;
  return 4;
}

function SortHeader({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-4 py-2.5 text-left", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          active ? "text-gray-700" : "text-gray-400 hover:text-gray-600"
        )}
      >
        {label}
        <ArrowUpDown size={11} className={active ? "text-gray-500" : "text-gray-300"} />
      </button>
    </th>
  );
}

export function PortfolioTable({
  products,
  teamColorMap,
  onClickProduct,
}: {
  products: Product[];
  teamColorMap: Record<string, string>;
  onClickProduct: (product: Product) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const items = [...products];
    const dir = sortAsc ? 1 : -1;

    items.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "health":
          return dir * (healthSortRank(a) - healthSortRank(b)) || a.name.localeCompare(b.name);
        case "owner":
          return (
            dir *
            (a.owner ?? "Unassigned").localeCompare(b.owner ?? "Unassigned") ||
            a.name.localeCompare(b.name)
          );
        case "debt":
          return (
            dir *
            ((a.open_tech_debt_count ?? 0) - (b.open_tech_debt_count ?? 0)) ||
            a.name.localeCompare(b.name)
          );
        case "cost":
          return (
            dir * ((a.annual_cost_total ?? 0) - (b.annual_cost_total ?? 0)) ||
            a.name.localeCompare(b.name)
          );
        case "roadmap":
          return (
            dir * ((a.roadmap_count ?? 0) - (b.roadmap_count ?? 0)) ||
            a.name.localeCompare(b.name)
          );
        default:
          return 0;
      }
    });

    return items;
  }, [products, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "name" || key === "owner");
    }
  };

  const defaultOrder = sortForCockpit(products);

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Portfolio · Table view · {sorted.length} of {products.length} product
        {products.length === 1 ? "" : "s"}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <SortHeader label="Name" active={sortKey === "name"} onClick={() => toggleSort("name")} />
                <SortHeader
                  label="Health"
                  active={sortKey === "health"}
                  onClick={() => toggleSort("health")}
                />
                <SortHeader
                  label="Owner"
                  active={sortKey === "owner"}
                  onClick={() => toggleSort("owner")}
                />
                <SortHeader label="Debt" active={sortKey === "debt"} onClick={() => toggleSort("debt")} />
                <SortHeader label="Cost / yr" active={sortKey === "cost"} onClick={() => toggleSort("cost")} />
                <SortHeader
                  label="Roadmap"
                  active={sortKey === "roadmap"}
                  onClick={() => toggleSort("roadmap")}
                  className="pr-5"
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((product) => {
                const health = productHealthStatus(product);
                const debt = formatCompactDebt(product);
                const teamColor = teamColorMap[product.owner ?? ""] ?? "#6366f1";

                return (
                  <tr
                    key={product.id}
                    onClick={() => onClickProduct(product)}
                    className={cn(
                      "border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors",
                      "hover:bg-indigo-50/40"
                    )}
                  >
                    <td className={cn("px-4 py-3 border-l-[3px]", ROW_ACCENT[health])}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="h-8 w-8 rounded-md flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                          style={{ backgroundColor: teamColor }}
                        >
                          {product.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-400 truncate">{productSubtitle(product)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                          HEALTH_CHIP[health]
                        )}
                      >
                        {tableHealthLabel(product)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {isUnowned(product) ? (
                        <span className="italic text-gray-400">Unassigned</span>
                      ) : (
                        <span className="truncate block max-w-[140px]">{product.owner}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          debt.critical ? "text-red-600" : "text-gray-900"
                        )}
                      >
                        {debt.value}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 tabular-nums whitespace-nowrap">
                      {formatProductCost(product.annual_cost_total)}
                    </td>
                    <td className="px-4 py-3 pr-5 text-gray-700 whitespace-nowrap">
                      {formatTableRoadmap(product)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 px-4 py-8 text-center">No products to show.</p>
        )}
      </div>

      {defaultOrder.length > 1 && sortKey === "health" && sortAsc && (
        <p className="text-[11px] text-gray-400">
          Sorted by urgency — products needing attention appear first.
        </p>
      )}
    </div>
  );
}
