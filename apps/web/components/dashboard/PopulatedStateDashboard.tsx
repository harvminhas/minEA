"use client";

import Link from "next/link";
import type { AiInsight } from "@minea/types";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { buildDashboardInsights, buildStructuralGaps, estateBriefing } from "@/lib/workspace-dashboard";
import { DashboardMetricsSection } from "@/components/dashboard/DashboardMetricsSection";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
}: Props) {
  const structuralGaps = buildStructuralGaps(metrics);
  const allInsights = buildDashboardInsights(metrics, insights);
  const weekRows = [
    metrics.capabilitiesWithoutSystemCount > 0
      ? {
          id: "no-system",
          title: `${countLabel(metrics.capabilitiesWithoutSystemCount, "piece of work has", "pieces of work have")} no system`,
          action: "Connect a system",
          href: `${basePath}/business/capabilities`,
        }
      : null,
    metrics.capabilitiesWithoutOwnerCount > 0
      ? {
          id: "no-owner",
          title: `${countLabel(metrics.capabilitiesWithoutOwnerCount, "piece of work has", "pieces of work have")} nobody accountable`,
          action: "Assign an owner",
          href: `${basePath}/business/capabilities`,
        }
      : null,
    metrics.shadowSystemCount > 0
      ? {
          id: "outside-it",
          title: `${countLabel(metrics.shadowSystemCount, "system is", "systems are")} outside IT`,
          action: "Review",
          href: `${basePath}/application/applications`,
        }
      : null,
  ].filter((row) => row !== null);

  return (
    <div className="max-w-5xl space-y-7">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-gray-600 mt-1">{estateBriefing(metrics)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {orgName} · last updated {lastUpdatedLabel}
          </p>
        </div>
      </header>

      <DashboardMetricsSection
        basePath={basePath}
        orgSlug={orgSlug}
        workspaceSlug={workspaceSlug}
        metrics={metrics}
      />

      <section className="rounded-2xl border border-gray-200/80 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">This week</h2>
            <button
              type="button"
              onClick={onOpenInsights}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View all
            </button>
          </div>

          {weekRows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">Nothing needs a decision this week.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {weekRows.map((row) => (
                <li key={row.id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-amber-400" />
                  <p className="text-[13px] text-gray-800 leading-snug flex-1 min-w-0">{row.title}</p>
                  <Link
                    href={row.href}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex-shrink-0"
                  >
                    {row.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {allInsights.length > structuralGaps.length && (
            <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-50">
              {allInsights.length - structuralGaps.length} additional insight
              {allInsights.length - structuralGaps.length === 1 ? "" : "s"} in the full list.
            </p>
          )}
      </section>
    </div>
  );
}
