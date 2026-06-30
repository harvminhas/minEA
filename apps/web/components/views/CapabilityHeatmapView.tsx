"use client";

import { useMemo, useState, type CSSProperties } from "react";
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

const FITNESS_CELL_CLASS: Record<string, string> = {
  strong: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  good: "bg-emerald-50/80 text-emerald-700 border border-emerald-100",
  fair: "bg-amber-50 text-amber-800 border border-amber-200",
  poor: "bg-orange-50 text-orange-800 border border-orange-200",
  eol: "bg-red-50 text-red-800 border border-red-200",
  gap: "border border-dashed border-gray-300 bg-white text-gray-500",
  unrated: "border border-dashed border-amber-300 bg-amber-50/50 text-amber-700",
};

function domainTagClass(domainId: string, index: number) {
  const hash = domainId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DOMAIN_TAG_STYLES[(hash + index) % DOMAIN_TAG_STYLES.length]!;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
        <span className="text-gray-300 mx-1.5">—</span>
        {subtitle}
      </p>
    </div>
  );
}

function DomainTag({ name, className }: { name: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize shrink-0",
        className
      )}
    >
      {name}
    </span>
  );
}

function CapabilityLabel({
  cap,
  domainStyle,
}: {
  cap: HeatmapCapabilityRow;
  domainStyle: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      {cap.domain_name && <DomainTag name={cap.domain_name} className={domainStyle} />}
      <span className="text-sm font-medium text-gray-900">{cap.name}</span>
      {cap.is_planned && <span className="text-xs text-gray-400">(planned)</span>}
    </div>
  );
}

function productTextStyle(color: string): CSSProperties {
  return {
    borderColor: `${color}55`,
    backgroundColor: `${color}14`,
    color,
  };
}

function ProductTextLabel({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold shrink-0",
        className
      )}
      style={productTextStyle(color)}
    >
      {name}
    </span>
  );
}

function ProductHeader({ product }: { product: HeatmapProductColumn }) {
  return (
    <div className="flex justify-center min-w-[88px] px-1">
      <ProductTextLabel name={product.name} color={product.color} />
    </div>
  );
}

function CoverageCell({ cell }: { cell: HeatmapCell }) {
  const level = cell.level as HeatmapCellLevel;

  if (level === "empty") {
    return (
      <span className="inline-flex h-9 min-w-[88px] items-center justify-center text-xs text-gray-400">
        n/a
      </span>
    );
  }

  const isFitness = level === "strong" || level === "good" || level === "fair" || level === "poor";

  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-[88px] items-center justify-center gap-1 rounded-md px-2.5 text-[11px] font-semibold whitespace-nowrap",
        FITNESS_CELL_CLASS[level] ?? FITNESS_CELL_CLASS.gap
      )}
      title={cell.label}
    >
      {isFitness && level === "strong" && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
      )}
      {cell.label}
    </span>
  );
}

function ProductPill({ name, color }: { name: string; color: string }) {
  return <ProductTextLabel name={name} color={color} />;
}

function claimingProductsForCap(
  cap: HeatmapCapabilityRow,
  products: HeatmapProductColumn[]
) {
  if (cap.claiming_products && cap.claiming_products.length > 0) {
    return cap.claiming_products;
  }
  return products
    .filter((product) => cap.cells[product.id]?.level !== "empty")
    .map((product) => ({ id: product.id, name: product.name, color: product.color }));
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

  const coverageCaps = useMemo(
    () => capabilities.filter((cap) => cap.realising_count === 1),
    [capabilities]
  );
  const sharedCaps = useMemo(
    () => capabilities.filter((cap) => cap.realising_count > 1),
    [capabilities]
  );
  const gapCaps = useMemo(
    () => capabilities.filter((cap) => cap.realising_count === 0),
    [capabilities]
  );

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

  const domainStyleFor = (cap: HeatmapCapabilityRow) =>
    domainStyles.get(cap.domain_id ?? cap.id) ?? DOMAIN_TAG_STYLES[0]!;

  return (
    <div className="space-y-5">
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

      {coverageCaps.length > 0 && (
        <section>
          <SectionHeading
            title="Coverage"
            subtitle="capabilities claimed by a product"
          />
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="sticky left-0 z-10 bg-white px-4 py-4 text-left text-xs font-semibold text-gray-500 w-[260px] min-w-[260px]">
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
                  {coverageCaps.map((cap) => (
                    <tr key={cap.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 align-middle border-r border-gray-100">
                        <CapabilityLabel cap={cap} domainStyle={domainStyleFor(cap)} />
                      </td>
                      {products.map((product) => {
                        const cell = cap.cells[product.id] ?? { level: "empty", label: "n/a" };
                        return (
                          <td key={product.id} className="px-3 py-3 text-center align-middle">
                            <CoverageCell cell={cell} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {sharedCaps.length > 0 && (
        <section>
          <SectionHeading title="Shared" subtitle="claimed by more than one product" />
          <div className="space-y-2">
            {sharedCaps.map((cap) => {
              const claimingProducts = claimingProductsForCap(cap, products);
              return (
              <div
                key={cap.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                  <CapabilityLabel cap={cap} domainStyle={domainStyleFor(cap)} />
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
                  {claimingProducts.map((product) => (
                    <ProductPill key={product.id} name={product.name} color={product.color} />
                  ))}
                  <span className="text-[11px] font-medium text-amber-800 pl-1">
                    review for redundancy
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {gapCaps.length > 0 && (
        <section>
          <SectionHeading title="Gaps" subtitle="no realising product" />
          <div className="space-y-2">
            {gapCaps.map((cap) => (
              <div
                key={cap.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <CapabilityLabel cap={cap} domainStyle={domainStyleFor(cap)} />
                <span className="text-[11px] text-gray-500 shrink-0">
                  {cap.gap_detail ?? "operations risk · no realising product"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-6 flex-wrap pt-1">
        <span className="inline-flex items-center gap-2 text-[11px] text-gray-500">
          <span className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 text-[10px] font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Strong
          </span>
          fitness of realising system
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] text-gray-500">
          <span className="text-xs text-gray-400 font-medium">n/a</span>
          this product doesn&apos;t claim the capability
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryFooterCard
          label="Capability gaps"
          value={String(summary.gap_count)}
          subtext={
            firstGap
              ? `${firstGap.capability_name} — no realising product`
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
