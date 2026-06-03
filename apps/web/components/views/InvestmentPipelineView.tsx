"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText } from "lucide-react";
import { objectsApi } from "@/lib/api-client";
import {
  buildInvestmentPipeline,
  pipelineStageFromItem,
  type PipelineInitiativeRow,
} from "@/lib/investment-pipeline";
import { roadmapDetailPath, targetResolutionLabel } from "@/lib/roadmap-utils";
import { useViewDataGate } from "@/lib/use-view-summary";
import { getView } from "@/lib/views";
import { cn, formatCurrency } from "@/lib/utils";

const PRODUCT_COLORS = ["#6366f1", "#f97316", "#ef4444", "#166534", "#0ea5e9", "#6b7280"];

function productColor(productId: string | null, index: number): string {
  if (!productId) return PRODUCT_COLORS[index % PRODUCT_COLORS.length]!;
  let hash = 0;
  for (let i = 0; i < productId.length; i++) {
    hash = productId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PRODUCT_COLORS[Math.abs(hash) % PRODUCT_COLORS.length]!;
}

function formatUpdatedAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function MetricCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: "red";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white px-5 py-4",
        accent === "red" ? "border-red-200" : "border-gray-200"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", accent === "red" ? "text-red-600" : "text-gray-900")}>
        {value}
      </p>
      <p className="text-[11px] text-gray-500 mt-1">{subtext}</p>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const style =
    status === "blocked"
      ? "bg-red-50 text-red-700 border-red-200"
      : status === "in_progress"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : status === "planned"
          ? "bg-orange-50 text-orange-800 border-orange-200"
          : status === "discovery"
            ? "bg-gray-100 text-gray-600 border-gray-200"
            : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", style)}>
      {label}
    </span>
  );
}

function InitiativeRow({
  row,
  orgSlug,
  workspaceSlug,
  color,
}: {
  row: PipelineInitiativeRow;
  orgSlug: string;
  workspaceSlug: string;
  color: string;
}) {
  return (
    <tr className="border-b border-gray-100 hover:bg-stone-50/50">
      <td className="px-4 py-3 align-top max-w-[280px]">
        <Link
          href={roadmapDetailPath(orgSlug, workspaceSlug, row.id)}
          className="font-semibold text-gray-900 hover:text-indigo-600"
        >
          {row.name}
        </Link>
        {row.subline && (
          <p
            className={cn(
              "text-xs mt-0.5 flex items-center gap-1",
              row.blocked ? "text-red-600" : "text-gray-400"
            )}
          >
            {row.blocked && <AlertTriangle size={11} className="flex-shrink-0" />}
            {row.subline}
          </p>
        )}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {row.productName ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
            <span
              className="h-5 w-5 rounded flex items-center justify-center text-white text-[9px] font-bold"
              style={{ backgroundColor: color }}
            >
              {row.productCode}
            </span>
            {row.productName}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-top text-sm text-gray-700">{row.typeLabel}</td>
      <td className="px-4 py-3 align-top">
        <StatusPill status={row.status} label={row.statusLabel} />
      </td>
      <td className="px-4 py-3 align-top text-sm font-medium text-gray-800">{row.effort}</td>
      <td className="px-4 py-3 align-top text-sm font-semibold text-gray-900 tabular-nums">
        {row.spend > 0 ? formatCurrency(row.spend) : "—"}
        {row.spendEstimated && row.spend > 0 && (
          <span className="text-[10px] text-gray-400 font-normal ml-0.5">est</span>
        )}
      </td>
      <td className="px-4 py-3 align-top text-sm text-gray-600 whitespace-nowrap">{row.targetLabel}</td>
    </tr>
  );
}

const investmentsView = getView("investments");

export function InvestmentPipelineView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, summaryPending, showEmptyFromSummary, skipHeavyFetch } =
    useViewDataGate("investments");

  const { data, isLoading, isPending, isError, error } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "roadmap_item"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return objectsApi.list(orgSlug, workspaceSlug, { type: "roadmap_item" }, token);
    },
    enabled: !skipHeavyFetch,
  });

  const items = data?.items ?? [];

  const pipeline = useMemo(() => {
    if (!items.length) return null;
    return buildInvestmentPipeline(items, { targetResolutionLabel });
  }, [items]);

  const includedCount = useMemo(
    () => items.filter((item) => pipelineStageFromItem(item) !== "excluded").length,
    [items]
  );

  if (summaryPending) {
    return <p className="text-sm text-gray-400">Loading investment pipeline…</p>;
  }

  if (showEmptyFromSummary) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <h2 className="font-semibold text-gray-900 mb-2">{investmentsView.emptyTitle}</h2>
        <p className="text-sm text-gray-500 mb-2">{investmentsView.emptyDescription}</p>
        <p className="text-xs text-gray-400">
          Add initiatives in Strategy → Roadmap to populate the investment pipeline.
        </p>
      </div>
    );
  }

  if (isLoading || isPending) {
    return <p className="text-sm text-gray-400">Loading investment pipeline…</p>;
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-lg">
        <p className="text-sm text-red-800 mb-1">Could not load roadmap items.</p>
        <p className="text-xs text-red-600">{error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <p className="text-sm text-gray-500 mb-2">No roadmap items yet.</p>
        <p className="text-xs text-gray-400">
          Add initiatives in Strategy → Roadmap to populate the investment pipeline.
        </p>
      </div>
    );
  }

  if (!pipeline || includedCount === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <p className="text-sm text-gray-500 mb-2">
          {items.length} roadmap item{items.length === 1 ? "" : "s"}, none in the active pipeline.
        </p>
        <p className="text-xs text-gray-400">
          Items marked delivered (prior years), deferred, or cancelled are excluded. Update status on
          Strategy → Roadmap to include them here.
        </p>
      </div>
    );
  }

  const { metrics, stages, mix, mixTotal, mixInsight, topInitiatives, hasEstimatedSpend, lastUpdated } =
    pipeline;
  const maxStageSpend = Math.max(...stages.map((s) => s.spend), 1);
  const activePipelineSpend = stages
    .filter((s) => s.id !== "done_ytd")
    .reduce((sum, s) => sum + s.spend, 0);
  const totalInitiatives = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        {formatCurrency(activePipelineSpend)} committed · {totalInitiatives} initiatives ·{" "}
        {metrics.atRiskCount} blocked · updated {formatUpdatedAgo(lastUpdated)}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Committed"
          value={formatCurrency(metrics.committedSpend)}
          subtext={`across ${metrics.activeCount} active initiatives`}
        />
        <MetricCard
          label="In flight"
          value={formatCurrency(metrics.inFlightSpend)}
          subtext={`${metrics.inFlightCount} initiatives delivering`}
        />
        <MetricCard
          label="At risk"
          value={String(metrics.atRiskCount)}
          subtext={`${formatCurrency(metrics.atRiskSpend)} exposure`}
          accent="red"
        />
        <MetricCard
          label="Delivered YTD"
          value={formatCurrency(metrics.deliveredYtdSpend)}
          subtext={`${metrics.deliveredYtdCount} initiatives done`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Pipeline by stage</h3>
            <p className="text-xs text-gray-400">commitment funnel</p>
          </div>
          <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-20 flex-shrink-0">{stage.label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", stage.barClass)}
                    style={{ width: `${Math.max(4, (stage.spend / maxStageSpend) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{stage.count}</span>
                <span
                  className={cn(
                    "text-xs font-semibold w-14 text-right tabular-nums",
                    stage.id === "blocked" ? "text-red-600" : "text-gray-900"
                  )}
                >
                  {formatCurrency(stage.spend)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Investment mix</h3>
            <p className="text-xs text-gray-400">of {formatCurrency(mixTotal)} committed</p>
          </div>
          {mixTotal > 0 ? (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-4">
                {mix.map((slice) =>
                  slice.percent > 0 ? (
                    <div
                      key={slice.category}
                      style={{ width: `${slice.percent}%`, backgroundColor: slice.color }}
                      title={`${slice.label} ${slice.percent}%`}
                    />
                  ) : null
                )}
              </div>
              <div className="space-y-2 mb-4">
                {mix.map((slice) => (
                  <div key={slice.category} className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-2 text-gray-700">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span>
                        <span className="font-medium">{slice.label}</span>
                        <span className="text-gray-400 text-xs ml-1">· {slice.hint}</span>
                      </span>
                    </span>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {formatCurrency(slice.spend)}
                    </span>
                  </div>
                ))}
              </div>
              {mixInsight && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-900">
                  <FileText size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
                  {mixInsight}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">Set investment category on roadmap items to see mix.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Top initiatives</h3>
          <p className="text-xs text-gray-400">largest 5 by committed effort</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                {["Initiative", "Product", "Type", "Status", "Effort", "Spend", "Target"].map((col) => (
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
              {topInitiatives.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                    No active initiatives with spend estimates.
                  </td>
                </tr>
              ) : (
                topInitiatives.map((row, i) => (
                  <InitiativeRow
                    key={row.id}
                    row={row}
                    orgSlug={orgSlug}
                    workspaceSlug={workspaceSlug}
                    color={productColor(row.productId, i)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hasEstimatedSpend && (
        <p className="text-[11px] text-gray-400 text-center">
          Spend estimated from effort × team rate where cost is not set on the roadmap item.
        </p>
      )}
    </div>
  );
}
