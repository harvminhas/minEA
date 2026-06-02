"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, Grid3X3, Layers, Server } from "lucide-react";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { setupBannerDismissKey } from "@/lib/workspace-dashboard";
import { DashboardMetricsSection } from "@/components/dashboard/DashboardMetricsSection";
import { DashboardViewsSection } from "@/components/dashboard/DashboardViewsSection";
import { HowItWorksTrigger } from "@/components/dashboard/HowItWorksModal";

const FIRST_STEPS = [
  {
    title: "Add a domain",
    description: "Group capabilities by business area — e.g. Finance, Sales, HR",
    hrefSegment: "business/capabilities",
    icon: Layers,
    step: "01",
  },
  {
    title: "Define capabilities",
    description: "What your business does inside each domain",
    hrefSegment: "business/capabilities",
    icon: Grid3X3,
    step: "02",
  },
  {
    title: "Add systems",
    description: "Tools and platforms that support your capabilities",
    hrefSegment: "application/applications",
    icon: Server,
    step: "03",
  },
] as const;

interface Props {
  basePath: string;
  orgSlug: string;
  workspaceSlug: string;
  greeting: string;
  userName: string;
  metrics: WorkspaceMetrics;
  onGetStarted: () => void;
  onOpenHowItWorks: () => void;
}

export function ZeroStateDashboard({
  basePath,
  orgSlug,
  workspaceSlug,
  greeting,
  userName,
  metrics,
  onGetStarted,
  onOpenHowItWorks,
}: Props) {
  const [bannerDismissed, setBannerDismissed] = useState(true);
  useEffect(() => {
    const key = setupBannerDismissKey(orgSlug, workspaceSlug);
    setBannerDismissed(localStorage.getItem(key) === "1");
  }, [orgSlug, workspaceSlug]);

  const dismissBanner = () => {
    const key = setupBannerDismissKey(orgSlug, workspaceSlug);
    localStorage.setItem(key, "1");
    setBannerDismissed(true);
  };

  return (
    <div className="max-w-5xl space-y-7">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-gray-400 mt-1">Your workspace is empty — let&apos;s get it set up.</p>
        </div>
        <HowItWorksTrigger onClick={onOpenHowItWorks} />
      </header>

      <DashboardMetricsSection
        basePath={basePath}
        orgSlug={orgSlug}
        workspaceSlug={workspaceSlug}
        metrics={metrics}
      />

      {/* Setup banner */}
      {!bannerDismissed && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Icon block */}
            <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-xl bg-indigo-600 shadow-sm shadow-indigo-200">
              <Grid3X3 size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-[15px]">Set up your workspace in minutes</p>
              <p className="text-sm text-gray-500 mt-0.5 max-w-md">
                Add your domains, systems, and capabilities all from one place. Takes about 5 minutes.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onGetStarted}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                Get started <ArrowRight size={14} />
              </button>
              <button
                type="button"
                onClick={dismissBanner}
                className="rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content panels */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        {/* First steps */}
        <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Suggested first steps</h2>
          <ol className="space-y-2">
            {FIRST_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  <Link
                    href={`${basePath}/${step.hrefSegment}`}
                    className="group flex items-center gap-3.5 rounded-xl border border-transparent px-3.5 py-3 hover:border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    <span className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-gray-100 group-hover:bg-indigo-100 transition-colors">
                      <Icon size={15} className="text-gray-500 group-hover:text-indigo-600 transition-colors" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-indigo-700 transition-colors leading-snug">
                        {step.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{step.description}</p>
                    </span>
                    <ChevronRight
                      size={15}
                      className="text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors"
                    />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <DashboardViewsSection basePath={basePath} metrics={metrics} />
      </div>
    </div>
  );
}
