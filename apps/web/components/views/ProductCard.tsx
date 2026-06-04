"use client";

import { AlertCircle, CircleDollarSign, Clock, Puzzle, Users } from "lucide-react";
import type { Product } from "@minea/types";
import { formatProductCost, roadmapStatusLabel } from "@/lib/portfolio-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { ProductSignalDots } from "@/components/views/ProductSignalDots";
import { cn } from "@/lib/utils";

interface Props {
  product: Product;
  color: string;
  onClick: () => void;
  selected?: boolean;
}

export function ProductCard({ product, color, onClick, selected }: Props) {
  const debtOpen = product.open_tech_debt_count ?? 0;
  const caps = product.capability_count ?? 0;
  const cost = formatProductCost(product.annual_cost_total);
  const costLabel = cost !== "—" ? `${cost}/yr` : "—";
  const roadmapLabel = roadmapStatusLabel(product.roadmap_status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left bg-white rounded-xl border p-4 w-full flex flex-col transition-all cursor-pointer",
        selected
          ? "border-violet-400 shadow-sm ring-1 ring-violet-100"
          : "border-gray-200 hover:border-violet-200 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {product.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-[15px] leading-tight truncate">
            {product.name}
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
            <Users size={12} className="flex-shrink-0 text-gray-400" />
            <span className="truncate">{product.owner ?? "Unassigned"}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-3 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium",
            debtOpen > 0 ? "text-red-600" : "text-gray-500"
          )}
        >
          <AlertCircle size={12} className="flex-shrink-0" />
          {debtOpen} tech debt
        </span>
        <span className="text-gray-300 select-none" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-center gap-1 text-gray-600">
          <Puzzle size={12} className="flex-shrink-0 text-gray-400" />
          {caps} {caps === 1 ? "capability" : "capabilities"}
        </span>
        <span className="text-gray-300 select-none" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-center gap-1 text-gray-600">
          <CircleDollarSign size={12} className="flex-shrink-0 text-gray-400" />
          {costLabel}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2 mt-3 min-h-[2.25rem]">
        <ProductSignalDots product={product} />
        {roadmapLabel !== "None" && (
          <span className="rounded-full bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-0.5 text-[11px] font-medium flex-shrink-0 capitalize">
            {roadmapLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated
          {product.updated_by_name ? (
            <>
              {" "}
              by <span className="font-semibold text-gray-600">{product.updated_by_name}</span>
            </>
          ) : null}{" "}
          {formatUpdatedAgo(product.updated_at)}
        </span>
      </div>
    </button>
  );
}
