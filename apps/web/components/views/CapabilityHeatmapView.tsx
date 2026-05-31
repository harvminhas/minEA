"use client";

import { Fragment, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import type { HeatmapCell, HeatmapCellLevel, HeatmapProductColumn } from "@minea/types";
import { capabilityMapApi } from "@/lib/api-client";
import { domainIcon } from "@/lib/capability-map-icons";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

type ColorMode = "fitness";

const CELL_STYLE: Record<string, string> = {
  strong: "bg-emerald-700 text-white",
  good: "bg-emerald-200 text-emerald-900",
  fair: "bg-amber-200 text-amber-900",
  poor: "bg-orange-300 text-orange-950",
  eol: "bg-red-700 text-white",
  gap: "border border-dashed border-red-300 bg-red-50/30 text-red-400",
  empty: "bg-stone-100/60 border border-stone-200/80",
};

const LEGEND: { level: HeatmapCellLevel; label: string; className: string }[] = [
  { level: "strong", label: "Strong", className: "bg-emerald-700" },
  { level: "good", label: "Good", className: "bg-emerald-300" },
  { level: "fair", label: "Fair", className: "bg-amber-300" },
  { level: "poor", label: "Poor", className: "bg-orange-300" },
  { level: "eol", label: "EOL", className: "bg-red-700" },
  { level: "gap", label: "Gap", className: "border border-dashed border-red-400 bg-red-50" },
];

function ProductHeader({ product }: { product: HeatmapProductColumn }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[72px] px-1">
      <span
        className="h-7 w-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
        style={{ backgroundColor: product.color }}
        title={product.name}
      >
        {product.short_code}
      </span>
      <span className="text-[10px] font-medium text-gray-600 truncate max-w-[72px]">
        {product.abbrev}
      </span>
    </div>
  );
}

function HeatmapCellView({
  cell,
  onClick,
}: {
  cell: HeatmapCell;
  onClick?: () => void;
}) {
  const level = cell.level;
  if (level === "empty") {
    return <div className="h-9 min-w-[72px] rounded-md mx-auto bg-stone-100/60 border border-stone-200/80" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 min-w-[72px] w-full max-w-[88px] mx-auto rounded-md text-[11px] font-semibold capitalize transition-opacity hover:opacity-90",
        CELL_STYLE[level] ?? CELL_STYLE.empty
      )}
      title={cell.label}
    >
      {cell.label}
    </button>
  );
}

function SummaryFooterCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: "red" | "amber" | "orange";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white px-5 py-4",
        accent === "red" && "border-red-200",
        accent === "amber" && "border-amber-200",
        accent === "orange" && "border-orange-200",
        !accent && "border-gray-200"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {label}
      </p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{subtext}</p>
    </div>
  );
}

export function CapabilityHeatmapView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [colorMode, setColorMode] = useState<ColorMode>("fitness");
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["capability-heatmap", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.heatmap(orgSlug, workspaceSlug, token!);
    },
  });

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading capability heatmap…</p>;
  }

  if (!data || (data.domains.length === 0 && data.products.length === 0)) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <p className="text-sm text-gray-500 mb-2">Nothing to heatmap yet.</p>
        <p className="text-xs text-gray-400">
          Add products, map them to capabilities, and define system fitness in the capability map.
        </p>
      </div>
    );
  }

  const { products, domains, summary } = data;
  const overlapNames = summary.overlaps.names.slice(0, 3).join(" · ");
  const gapItem = summary.gaps[0];
  const hotSpot = summary.hot_spots[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">
          {summary.capability_count} capabilit{summary.capability_count === 1 ? "y" : "ies"} ·{" "}
          {summary.product_count} product{summary.product_count === 1 ? "" : "s"} · {summary.gap_count}{" "}
          gap{summary.gap_count === 1 ? "" : "s"} · {summary.overlap_count} overlap
          {summary.overlap_count === 1 ? "" : "s"}
        </p>

        <div className="relative">
          <label className="sr-only" htmlFor="heatmap-color-by">
            Color by
          </label>
          <div className="inline-flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <span className="text-gray-400 text-xs">Color by:</span>
            <select
              id="heatmap-color-by"
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
              className="text-sm font-semibold text-gray-900 bg-transparent border-none outline-none cursor-pointer pr-5 appearance-none"
            >
              <option value="fitness">Fitness</option>
            </select>
            <ChevronDown size={14} className="text-gray-400 -ml-4 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-[200px] min-w-[200px]">
                  Capability
                </th>
                {products.map((product) => (
                  <th key={product.id} className="px-2 py-3 text-center align-bottom">
                    <ProductHeader product={product} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => {
                const Icon = domainIcon(domain.icon);
                return (
                  <Fragment key={domain.id}>
                    <tr className="bg-stone-50 border-y border-gray-200">
                      <td
                        colSpan={products.length + 1}
                        className="sticky left-0 px-4 py-2 bg-stone-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon size={13} className="text-gray-500 flex-shrink-0" />
                            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                              {domain.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {domain.capabilities.length} capabilit
                            {domain.capabilities.length === 1 ? "y" : "ies"}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {domain.capabilities.map((cap) => (
                      <tr key={cap.id} className="border-b border-gray-100 hover:bg-stone-50/40">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2.5 align-middle border-r border-gray-100">
                          <span className="text-sm font-medium text-gray-900">{cap.name}</span>
                          {cap.is_planned && (
                            <span className="text-xs text-gray-400 ml-1">(planned)</span>
                          )}
                          {cap.overlap && (
                            <span className="block text-[10px] text-amber-600 font-medium mt-0.5">
                              overlap
                            </span>
                          )}
                        </td>
                        {products.map((product) => {
                          const cell = cap.cells[product.id] ?? { level: "empty", label: "" };
                          const cellKey = `${cap.id}:${product.id}`;
                          return (
                            <td key={product.id} className="px-2 py-2 text-center align-middle">
                              <HeatmapCellView
                                cell={cell}
                                onClick={
                                  cell.level !== "empty"
                                    ? () => setSelectedCell(cellKey)
                                    : undefined
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-4 flex-wrap">
            {LEGEND.map(({ level, label, className }) => (
              <span key={level} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className={cn("h-2.5 w-2.5 rounded-sm flex-shrink-0", className)} />
                {label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">Click a cell for details</p>
        </div>
      </div>

      {selectedCell && (
        <p className="text-xs text-gray-500">
          Selected cell <span className="font-mono text-gray-700">{selectedCell}</span> — detail panel
          coming soon.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryFooterCard
          label="Capability gaps"
          value={gapItem?.capability_name ?? "None"}
          subtext={gapItem?.detail ?? "Every capability has a realising product"}
          accent={summary.gap_count > 0 ? "red" : undefined}
        />
        <SummaryFooterCard
          label="Overlaps"
          value={`${summary.overlap_count} capabilit${summary.overlap_count === 1 ? "y" : "ies"}`}
          subtext={overlapNames || "No overlapping realisations"}
          accent={summary.overlap_count > 0 ? "amber" : undefined}
        />
        <SummaryFooterCard
          label="Hot spots"
          value={hotSpot?.capability_name ?? "None"}
          subtext={hotSpot?.detail ?? "No EOL + weak combinations detected"}
          accent={hotSpot ? "orange" : undefined}
        />
      </div>
    </div>
  );
}
