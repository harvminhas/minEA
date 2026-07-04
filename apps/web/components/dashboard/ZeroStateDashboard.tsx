"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Server, Share2 } from "lucide-react";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { DashboardMetricsSection } from "@/components/dashboard/DashboardMetricsSection";
import { DashboardViewsSection } from "@/components/dashboard/DashboardViewsSection";
import { cn } from "@/lib/utils";

const FIRST_STEPS = [
  {
    title: "Add systems",
    description: "Everything running in your estate — apps, tools, even the messy ones.",
    hrefSegment: "application/applications",
    active: true,
  },
  {
    title: "Map integrations",
    description: "How your systems actually talk to each other.",
    hrefSegment: "integration/apis",
    active: false,
  },
  {
    title: "Group into domains",
    description: "Optional. Do this once you have a few systems in.",
    hrefSegment: "business/capabilities",
    active: false,
    optional: true,
  },
] as const;

interface Props {
  basePath: string;
  orgSlug: string;
  workspaceSlug: string;
  greeting: string;
  userName: string;
  metrics: WorkspaceMetrics;
}

export function ZeroStateDashboard({
  basePath,
  orgSlug,
  workspaceSlug,
  greeting,
  userName,
  metrics,
}: Props) {
  const systemsHref = `${basePath}/application/applications`;

  return (
    <div className="max-w-5xl space-y-7">
      <header>
        <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
          {greeting}, {userName}
        </h1>
        <p className="text-sm text-gray-400 mt-1">Your workspace is empty — let&apos;s get it set up.</p>
      </header>

      <DashboardMetricsSection
        basePath={basePath}
        orgSlug={orgSlug}
        workspaceSlug={workspaceSlug}
        metrics={metrics}
        emptyWorkspace
      />

      <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <Server size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-[15px]">Start with what you have</p>
            <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
              List the systems in your estate first. Group them into domains and capabilities later,
              once you can see the whole picture.
            </p>
          </div>
          <Link
            href={systemsHref}
            className="inline-flex flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
          >
            Add systems
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Suggested first steps</h2>
          <ol className="space-y-1">
            {FIRST_STEPS.map((step) => (
              <li key={step.title}>
                <Link
                  href={`${basePath}/${step.hrefSegment}`}
                  className="group flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-gray-50 transition-colors"
                >
                  {step.active ? (
                    <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-sky-500" />
                  ) : (
                    <Circle size={18} className="mt-0.5 flex-shrink-0 text-gray-300" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-sm font-medium leading-snug",
                          step.active ? "text-gray-900" : "text-gray-700"
                        )}
                      >
                        {step.title}
                      </p>
                      {"optional" in step && step.optional && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          optional
                        </span>
                      )}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{step.description}</p>
                  </span>
                  {step.title === "Map integrations" && (
                    <Share2
                      size={14}
                      className="mt-1 flex-shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <DashboardViewsSection basePath={basePath} metrics={metrics} emptyWorkspace />
      </div>
    </div>
  );
}
