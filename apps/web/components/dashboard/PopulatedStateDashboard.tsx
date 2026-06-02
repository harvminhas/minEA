"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AiInsight } from "@minea/types";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { buildDashboardViewCards, metricSubtexts } from "@/lib/workspace-dashboard";
import { MetricSummaryCard } from "@/components/dashboard/MetricSummaryCard";
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
  greeting,
  userName,
  orgName,
  lastUpdatedLabel,
  metrics,
  insights,
  onOpenInsights,
}: Props) {
  const subtexts = metricSubtexts(metrics, insights);
  const viewCards = buildDashboardViewCards(basePath, metrics);
  const topInsights = insights.slice(0, 5);

  return (
    <div className="max-w-5xl space-y-7">
      {/* Header */}
      <header>
        <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
          {greeting}, {userName}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {orgName} · last updated {lastUpdatedLabel}
        </p>
      </header>

      {/* Metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricSummaryCard label="Domains" value={metrics.domainCount} subtext={subtexts.domains} />
        <MetricSummaryCard label="Capabilities" value={metrics.capabilityCount} subtext={subtexts.capabilities} />
        <MetricSummaryCard label="Systems" value={metrics.systemCount} subtext={subtexts.systems} />
        <MetricSummaryCard
          label="Products"
          value={metrics.productCount}
          subtext={subtexts.products}
          variant={subtexts.products.includes("incomplete") ? "warn" : "default"}
        />
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        {/* Insights */}
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
          {topInsights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
              <div className="h-8 w-8 rounded-full bg-gray-100 mb-3" />
              <p className="text-sm text-gray-400">No insights yet.</p>
              <p className="text-xs text-gray-300 mt-1">Use the bell icon to analyse your architecture.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {topInsights.map((insight) => {
                const cfg = severityConfig(insight.severity);
                const count = insightCount(insight);
                return (
                  <li key={insight.id} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                    <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0 mt-px", cfg.dot)} />
                    <span className="flex-1 text-[13px] text-gray-700 leading-snug">{insight.title}</span>
                    {count !== null && (
                      <span
                        className={cn(
                          "text-xs font-semibold rounded-full border px-2 py-0.5 tabular-nums",
                          cfg.badge
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Views */}
        <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Views</h2>
            <Link
              href={`${basePath}/views`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              All views
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {viewCards.map((card) => {
              const Icon = card.icon;
              if (card.ready) {
                return (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="group flex flex-col gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 px-3.5 py-3 hover:border-indigo-200/70 hover:bg-indigo-50/30 transition-all"
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${card.iconColor}15` }}
                    >
                      <Icon size={15} style={{ color: card.iconColor }} />
                    </span>
                    <span>
                      <p className="text-xs font-semibold text-gray-800 group-hover:text-indigo-800 transition-colors leading-snug">
                        {card.label}
                      </p>
                      <p className="text-[10px] font-medium text-emerald-600 mt-0.5 flex items-center gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-emerald-400 inline-block" />
                        Ready
                      </p>
                    </span>
                  </Link>
                );
              }
              return (
                <div
                  key={card.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-gray-100 bg-white px-3.5 py-3 opacity-60"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                    <Icon size={15} className="text-gray-400" />
                  </span>
                  <span>
                    <p className="text-xs font-semibold text-gray-600 leading-snug">{card.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{card.statusLabel}</p>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
