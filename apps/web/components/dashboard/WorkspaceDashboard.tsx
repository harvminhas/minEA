"use client";

import { useMemo, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { useWorkspaceDashboard } from "@/lib/use-workspace-dashboard";
import { useArchitectureInsights } from "@/lib/use-architecture-insights";
import {
  greetingForHour,
  greetingName,
  isWorkspaceEmpty,
} from "@/lib/workspace-dashboard";
import { ZeroStateDashboard } from "@/components/dashboard/ZeroStateDashboard";
import { PopulatedStateDashboard } from "@/components/dashboard/PopulatedStateDashboard";
import { ArchitectureInsightsPanel } from "@/components/insights/ArchitectureInsightsPanel";
import { HowItWorksModal } from "@/components/dashboard/HowItWorksModal";
import { WorkspaceSnapshotRefreshBar } from "@/components/dashboard/WorkspaceSnapshotRefreshBar";

function formatUpdatedAgo(iso: string | null): string {
  if (!iso) return "recently";
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? "" : "s"} ago`;
  return `${Math.floor(diffH / 24)} day${Math.floor(diffH / 24) === 1 ? "" : "s"} ago`;
}

export function WorkspaceDashboard() {
  const { user } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { activeOrg, setViewMode } = useAppStore();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const { data: dashboardState, isPending, isError, error, refetch } =
    useWorkspaceDashboard(orgSlug, workspaceSlug);
  const metrics = dashboardState?.metrics;
  const insightsState = useArchitectureInsights(orgSlug, workspaceSlug);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const userName = greetingName(user?.displayName, user?.email);
  const empty = metrics ? isWorkspaceEmpty(metrics) : true;

  useEffect(() => {
    if (empty) setViewMode("repository");
  }, [empty, setViewMode]);

  // Skeleton only on first load (no cached metrics yet)
  if (isPending) {
    return (
      <div className="px-8 py-9 max-w-5xl">
        <div className="h-8 w-64 bg-gray-200/70 rounded-xl animate-pulse mb-2" />
        <div className="h-4 w-36 bg-gray-100 rounded-lg animate-pulse mb-8" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-8 py-9 max-w-5xl">
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Could not load workspace summary."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="px-8 py-9 min-h-full bg-gray-50/50">
        {dashboardState && (dashboardState.stale || dashboardState.rebuilding) && (
          <WorkspaceSnapshotRefreshBar
            stale={dashboardState.stale}
            rebuilding={dashboardState.rebuilding}
            className="mb-5"
          />
        )}
        {empty && metrics ? (
          <ZeroStateDashboard
            basePath={basePath}
            orgSlug={orgSlug}
            workspaceSlug={workspaceSlug}
            greeting={greeting}
            userName={userName}
            metrics={metrics}
          />
        ) : metrics ? (
          <PopulatedStateDashboard
            basePath={basePath}
            orgSlug={orgSlug}
            workspaceSlug={workspaceSlug}
            greeting={greeting}
            userName={userName}
            orgName={activeOrg?.name ?? orgSlug}
            lastUpdatedLabel={formatUpdatedAgo(insightsState.analysedAt)}
            metrics={metrics}
            insights={insightsState.insights}
            onOpenInsights={() => setInsightsOpen(true)}
            onOpenHowItWorks={() => setHowItWorksOpen(true)}
          />
        ) : null}
      </div>

      <ArchitectureInsightsPanel
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        insights={insightsState.insights}
        count={insightsState.count}
        analysedAt={insightsState.analysedAt}
        isLoading={insightsState.isLoading}
        isGenerating={insightsState.isGenerating}
        onRefresh={insightsState.refresh}
      />

      <HowItWorksModal open={howItWorksOpen} onClose={() => setHowItWorksOpen(false)} />
    </>
  );
}
