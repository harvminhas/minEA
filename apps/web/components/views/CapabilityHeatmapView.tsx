"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import type {
  HeatmapCell,
  HeatmapCellLevel,
  HeatmapCapabilityRow,
  HeatmapProductColumn,
} from "@minea/types";
import { capabilityMapApi } from "@/lib/api-client";
import { useViewDataGate } from "@/lib/use-view-summary";
import { getView } from "@/lib/views";
import { cn } from "@/lib/utils";

type ColorMode = "fitness";

const DOMAIN_TAG_STYLES = [
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-sky-100 text-sky-800 border-sky-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-indigo-100 text-indigo-800 border-indigo-200",
];

const CELL_CLASS: Record<string, string> = {
  strong: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  good: "bg-emerald-50/80 text-emerald-700 border border-emerald-100",
  fair: "bg-amber-50 text-amber-800 border border-amber-200",
  poor: "bg-orange-50 text-orange-800 border border-orange-200",
  eol: "bg-red-50 text-red-800 border border-red-200",
  gap: "border border-dashed border-gray-300 bg-white text-gray-500",
  unrated: "border border-dashed border-amber-400 bg-amber-50/40 text-amber-700",
};

function domainTagClass(domainId: string, index: number) {
  const hash = domainId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DOMAIN_TAG_STYLES[(hash + index) % DOMAIN_TAG_STYLES.length]!;
}

function ProductHeader({ product }: { product: HeatmapProductColumn }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[88px] px-1">
      <span
        className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
        style={{ backgroundColor: product.color }}
        title={product.name}
      >
        {product.short_code}
      </span>
      <span className="text-xs font-medium text-gray-700 text-center leading-tight max-w-[96px]">
        {product.name}
      </span>
    </div>
  );
}

function HeatmapCellView({ cell }: { cell: HeatmapCell }) {
  const level = cell.level as HeatmapCellLevel;

  if (level === "empty") {
    return (
      <span className="inline-flex h-9 min-w-[88px] items-center justify-center text-sm text-gray-300">
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-[88px] items-center justify-center rounded-md px-2 text-[11px] font-medium whitespace-nowrap",
        CELL_CLASS[level] ?? CELL_CLASS.gap
      )}
      title={cell.label}
    >
      {cell.label}
    </span>
  );
}

function CapabilityRow({
  cap,
  products,
  domainStyle,
}: {
  cap: HeatmapCapabilityRow;
  products: HeatmapProductColumn[];
  domainStyle: string;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="sticky left-0 z-10 bg-white px-4 py-3 align-middle border-r border-gray-100 min-w-[240px]">
        <div className="flex flex-wrap items-center gap-2">
          {cap.domain_name && (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                domainStyle
              )}
            >
              {cap.domain_name}
            </span>
          )}
          <span className="text-sm font-medium text-gray-900">{cap.name}</span>
          {cap.is_planned && <span className="text-xs text-gray-400">(planned)</span>}
          {cap.overlap && (
            <span className="inline-flex items-center rounded-md border border-dashed border-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              overlap
            </span>
          )}
        </div>
      </td>
      {products.map((product) => {
        const cell = cap.cells[product.id] ?? { level: "empty", label: "—" };
        return (
          <td key={product.id} className="px-3 py-3 text-center align-middle">
            <HeatmapCellView cell={cell} />
          </td>
        );
      })}
    </tr>
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
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{subtext}</p>
    </div>
  );
}

const heatmapView = getView("capability-heatmap");

export function CapabilityHeatmapView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, summaryPending, showEmptyFromSummary, skipHeavyFetch, metrics } =
    useViewDataGate("capability-heatmap");
  const [colorMode, setColorMode] = useState<ColorMode>("fitness");

  const { data, isLoading } = useQuery({
    queryKey: ["capability-heatmap", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.heatmap(orgSlug, workspaceSlug, token!);
    },
    enabled: !skipHeavyFetch,
  });

  const capabilities = useMemo(() => {
    if (!data) return [];
    return data.domains.flatMap((domain) =>
      domain.capabilities.map((cap) => ({
        ...cap,
        domain_name: cap.domain_name ?? domain.name,
        domain_id: domain.id,
      }))
    );
  }, [data]);

  const domainStyles = useMemo(() => {
    if (!data) return new Map<string, string>();
    const styles = new Map<string, string>();
    data.domains.forEach((domain, index) => {
      styles.set(domain.id, domainTagClass(domain.id, index));
    });
    return styles;
  }, [data]);

  if (summaryPending) {
    return <p className="text-sm text-gray-400">Loading capability heatmap…</p>;
  }

  if (showEmptyFromSummary) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <h2 className="font-semibold text-gray-900 mb-2">{heatmapView.emptyTitle}</h2>
        <p className="text-sm text-gray-500 mb-2">{heatmapView.emptyDescription}</p>
        {metrics && metrics.capabilityCount === 0 && metrics.productCount > 0 && (
          <p className="text-xs text-gray-400">Add capabilities on the capability map first.</p>
        )}
        {metrics && metrics.productCount === 0 && metrics.capabilityCount > 0 && (
          <p className="text-xs text-gray-400">Add products and link them to capabilities.</p>
        )}
      </div>
    );
  }

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

  const { products, summary } = data;
  const firstGap = summary.gaps[0];
  const firstOverlap = summary.overlaps.names[0];
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
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-white px-4 py-4 text-left text-xs font-semibold text-gray-500 w-[240px] min-w-[240px]">
                  Capability
                </th>
                {products.map((product) => (
                  <th key={product.id} className="px-3 py-4 text-center align-bottom">
                    <ProductHeader product={product} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {capabilities.map((cap) => (
                <CapabilityRow
                  key={cap.id}
                  cap={cap}
                  products={products}
                  domainStyle={
                    domainStyles.get(cap.domain_id ?? cap.id) ?? DOMAIN_TAG_STYLES[0]!
                  }
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-5 flex-wrap px-4 py-3 border-t border-gray-100 bg-gray-50/60">
          <span className="inline-flex items-center gap-2 text-[11px] text-gray-500">
            <span className="inline-flex h-7 min-w-[72px] items-center justify-center rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium">
              ● Strong
            </span>
            well supported
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] text-gray-500">
            <span className="inline-flex h-7 min-w-[56px] items-center justify-center rounded-md border border-dashed border-gray-300 text-[10px] font-medium text-gray-500">
              — gap
            </span>
            no realising product
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] text-gray-500">
            <span className="inline-flex h-6 items-center justify-center rounded-md border border-dashed border-amber-400 px-2 text-[10px] font-semibold text-amber-700">
              overlap
            </span>
            multiple products claim it
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] text-gray-500">
            <span className="text-sm text-gray-300">—</span>
            not applicable
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryFooterCard
          label="Capability gaps"
          value={String(summary.gap_count)}
          subtext={
            firstGap
              ? `${firstGap.capability_name} — ${firstGap.detail}`
              : "Every capability has a realising product"
          }
          accent={summary.gap_count > 0 ? "red" : undefined}
        />
        <SummaryFooterCard
          label="Overlaps"
          value={String(summary.overlap_count)}
          subtext={
            firstOverlap
              ? `${firstOverlap} — review for redundancy`
              : "No overlapping realisations"
          }
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
