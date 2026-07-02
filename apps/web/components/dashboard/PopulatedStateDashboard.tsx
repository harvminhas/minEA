"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AiInsight } from "@minea/types";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import {
  buildDashboardInsights,
  buildStructuralGaps,
  buildStructuralSummary,
  dashboardPrimaryCta,
} from "@/lib/workspace-dashboard";
import { DashboardMetricsSection } from "@/components/dashboard/DashboardMetricsSection";
import { DashboardViewsSection } from "@/components/dashboard/DashboardViewsSection";
import { HowItWorksTrigger } from "@/components/dashboard/HowItWorksModal";
import { cn } from "@/lib/utils";

function severityConfig(severity: AiInsight["severity"]) {
  switch (severity) {
    case "high":
      return { dot: "bg-red-400", badge: "bg-red-50 text-red-600 border-red-100" };
    case "medium":
      return { dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-100" };
    default:
      return { dot: "bg-blue-300", badge: "bg-blue-50 text-blue-600 border-blue-100" };
  }
}

interface Props {
  basePath: string;
  orgSlug: string;
  workspaceSlug: string;
  greeting: string;
  userName: string;
  orgName: string;
  lastUpdatedLabel: string;
  metrics: WorkspaceMetrics;
  insights: AiInsight[];
  onOpenInsights: () => void;
  onOpenHowItWorks: () => void;
}

export function PopulatedStateDashboard({
  basePath,
  orgSlug,
  workspaceSlug,
  greeting,
  userName,
  orgName,
  lastUpdatedLabel,
  metrics,
  insights,
  onOpenInsights,
  onOpenHowItWorks,
}: Props) {
  const structuralGaps = buildStructuralGaps(metrics);
  const structuralSummary = buildStructuralSummary(metrics);
  const allInsights = buildDashboardInsights(metrics, insights);
  const cta = dashboardPrimaryCta(metrics, basePath);
  const topGaps = structuralGaps.slice(0, 6);

  return (
    <div className="max-w-5xl space-y-7">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {orgName} · last updated {lastUpdatedLabel}
          </p>
        </div>
        <HowItWorksTrigger onClick={onOpenHowItWorks} />
      </header>

      <DashboardMetricsSection
        basePath={basePath}
        orgSlug={orgSlug}
        workspaceSlug={workspaceSlug}
        metrics={metrics}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <section className="rounded-2xl border border-gray-200/80 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Structural gaps</h2>
            <button
              type="button"
              onClick={onOpenInsights}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View all
            </button>
          </div>

          {structuralSummary ? (
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="text-xs text-gray-600 leading-relaxed">{structuralSummary}</p>
            </div>
          ) : (
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="text-xs text-emerald-700/90 leading-relaxed">
                No structural gaps detected in core repository coverage.
              </p>
            </div>
          )}

          {cta && (
            <div className="mx-5 mt-4 mb-1 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3.5">
              <p className="text-sm text-gray-700 leading-snug">{cta.message}</p>
              <Link
                href={cta.actionHref}
                className="inline-flex items-center gap-1 mt-2.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {cta.actionLabel}
                <ArrowUpRight size={14} />
              </Link>
            </div>
          )}

          {topGaps.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No structural gaps right now.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {topGaps.map((gap) => {
                const cfg = severityConfig(gap.severity);
                return (
                  <li
                    key={gap.id}
                    className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0 mt-2", cfg.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-gray-800 leading-snug">{gap.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{gap.subtitle}</p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold rounded-full border px-2 py-0.5 tabular-nums flex-shrink-0",
                        cfg.badge
                      )}
                    >
                      {gap.badgeLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {allInsights.length > structuralGaps.length && (
            <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-50">
              {allInsights.length - structuralGaps.length} additional insight
              {allInsights.length - structuralGaps.length === 1 ? "" : "s"} in the full list.
            </p>
          )}
        </section>

        <DashboardViewsSection basePath={basePath} metrics={metrics} />
      </div>
    </div>
  );
}
