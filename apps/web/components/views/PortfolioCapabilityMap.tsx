"use client";

import { Fragment } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { Product } from "@minea/types";
import { capabilityMapApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { domainIcon } from "@/lib/capability-map-icons";
import {
  buildPortfolioCapabilityMap,
  type CapabilityFitnessDisplay,
  type PortfolioCapabilityRow,
} from "@/lib/portfolio-capability-map";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

const PRODUCT_COLORS = [
  "#6366f1", "#92400e", "#166534", "#0ea5e9", "#ec4899", "#8b5cf6", "#f59e0b",
];

const FITNESS_STYLE: Record<
  CapabilityFitnessDisplay,
  { pill: string; label: string }
> = {
  good: { pill: "bg-emerald-100 text-emerald-800", label: "good" },
  fair: { pill: "bg-amber-100 text-amber-800", label: "fair" },
  poor: { pill: "bg-red-100 text-red-800", label: "poor" },
  none: { pill: "border border-dashed border-gray-300 text-gray-400", label: "—" },
};

function productColor(productId: string): string {
  let hash = 0;
  for (let i = 0; i < productId.length; i++) {
    hash = productId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PRODUCT_COLORS[Math.abs(hash) % PRODUCT_COLORS.length]!;
}

function ProductChip({
  product,
  onClick,
}: {
  product: PortfolioCapabilityRow["products"][0];
  onClick?: () => void;
}) {
  const planned = product.lifecycle === "planned";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 max-w-full text-left hover:opacity-80"
    >
      <span
        className="h-5 w-5 rounded flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
        style={{ backgroundColor: productColor(product.id) }}
      >
        {product.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-xs text-gray-700 truncate">
        {product.name}
        {planned && <span className="text-gray-400 italic"> (planned)</span>}
      </span>
    </button>
  );
}

function RealisedByCell({
  row,
  onProductClick,
}: {
  row: PortfolioCapabilityRow;
  onProductClick: (productId: string) => void;
}) {
  if (row.hasGap) {
    return (
      <span className="text-xs text-gray-400 italic">
        No realising product — capability gap
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {row.products.map((product) => (
        <ProductChip
          key={product.id}
          product={product}
          onClick={() => onProductClick(product.id)}
        />
      ))}
      {row.hasOverlap && (
        <p className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
          overlap <AlertTriangle size={10} />
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: "amber" | "orange";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white px-5 py-4",
        accent === "amber" && "border-amber-200",
        accent === "orange" && "border-orange-200",
        !accent && "border-gray-200"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1">{subtext}</p>
    </div>
  );
}

export function PortfolioCapabilityMap({
  products,
  onProductClick,
}: {
  products: Product[];
  onProductClick: (productId: string) => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const { data, isLoading } = useQuery({
    queryKey: ["portfolio-capability-map", orgSlug, workspaceSlug, products.length],
    queryFn: async () => {
      const token = await getToken();
      const [map, caps, rels] = await Promise.all([
        capabilityMapApi.get(orgSlug, workspaceSlug, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!),
        relationshipsApi.list(orgSlug, workspaceSlug, { type: "supported_by" }, token!),
      ]);
      return buildPortfolioCapabilityMap(map, products, caps.items, rels);
    },
  });

  const totalCaps = data?.summary.totalCapabilities ?? 0;

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading capability map…</p>;
  }

  if (!data || data.domains.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <p className="text-sm text-gray-500 mb-2">No capability map defined yet.</p>
        <p className="text-xs text-gray-400">
          Add domains and capabilities from Repository → Strategy → Capability map.
        </p>
      </div>
    );
  }

  const { domains, summary } = data;
  const overlapSubtext =
    summary.overlapNames.length > 0
      ? summary.overlapNames.slice(0, 2).join(" · ") +
        (summary.overlapNames.length > 2 ? ` · +${summary.overlapNames.length - 2}` : "")
      : "None detected";

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Portfolio · Capability map · {totalCaps} capabilit{totalCaps === 1 ? "y" : "ies"}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                {["Capability", "Fitness", "Realised by", "Status", "Coverage"].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => {
                const Icon = domainIcon(domain.icon);
                return (
                  <Fragment key={domain.id}>
                    <tr className="bg-stone-50 border-b border-gray-200">
                      <td colSpan={5} className="px-4 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon size={14} className="text-gray-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide truncate">
                              {domain.name}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-400 flex-shrink-0">
                            {domain.rows.length} capabilit{domain.rows.length === 1 ? "y" : "ies"}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {domain.rows.map((row) => {
                      const fitnessStyle = FITNESS_STYLE[row.fitness];
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-gray-100 last:border-b-0 hover:bg-stone-50/50"
                        >
                          <td className="px-4 py-3 align-top max-w-[220px]">
                            <p className="font-semibold text-gray-900">{row.name}</p>
                            {row.description && (
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                {row.description}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                                fitnessStyle.pill
                              )}
                            >
                              {fitnessStyle.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top min-w-[200px]">
                            <RealisedByCell row={row} onProductClick={onProductClick} />
                          </td>
                          <td className="px-4 py-3 align-top text-gray-700 whitespace-nowrap">
                            {row.statusLabel}
                          </td>
                          <td className="px-4 py-3 align-top text-gray-700 whitespace-nowrap tabular-nums">
                            {row.systemCount} system{row.systemCount === 1 ? "" : "s"}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Coverage"
          value={`${summary.realisedCount} of ${summary.totalCapabilities}`}
          subtext={
            summary.unrealisedCount > 0
              ? `${summary.unrealisedCount} capabilit${summary.unrealisedCount === 1 ? "y" : "ies"} not realised`
              : "All capabilities have a product"
          }
        />
        <SummaryCard
          label="Overlaps"
          value={String(summary.overlapCount)}
          subtext={overlapSubtext}
          accent="amber"
        />
        <SummaryCard
          label="Poor fitness"
          value={String(summary.poorFitnessCount)}
          subtext="Need investment"
          accent="orange"
        />
      </div>
    </div>
  );
}
