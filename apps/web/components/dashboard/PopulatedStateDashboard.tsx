"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AiInsight } from "@minea/types";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import {
  buildDashboardInsights,
  dashboardPrimaryCta,
  workspaceCompletenessPercent,
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

function insightCount(insight: AiInsight): number | null {
  const match = insight.title.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
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
  const allInsights = buildDashboardInsights(metrics, insights);
  const completeness = workspaceCompletenessPercent(metrics);
  const cta = dashboardPrimaryCta(metrics, basePath);
  const topInsights = allInsights.slice(0, 6);

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
        insights={allInsights}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <section className="rounded-2xl border border-gray-200/80 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Architecture insights</h2>
            <button
              type="button"
              onClick={onOpenInsights}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View all
            </button>
          </div>

          <div className="px-5 py-4 border-b border-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">Workspace completeness</span>
              <span className="text-xs font-semibold text-indigo-600 tabular-nums">{completeness}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>

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

          <ul className="divide-y divide-gray-50">
            {topInsights.map((insight) => {
              const cfg = severityConfig(insight.severity);
              const count = insightCount(insight);
              return (
                <li
                  key={insight.id}
                  className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0 mt-px", cfg.dot)} />
                  <span className="flex-1 text-[13px] text-gray-700 leading-snug">{insight.title}</span>
                  {count !== null ? (
                    <span
                      className={cn(
                        "text-xs font-semibold rounded-full border px-2 py-0.5 tabular-nums",
                        cfg.badge
                      )}
                    >
                      {count}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 tabular-nums w-6 text-center">—</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <DashboardViewsSection basePath={basePath} metrics={metrics} />
      </div>
    </div>
  );
}
