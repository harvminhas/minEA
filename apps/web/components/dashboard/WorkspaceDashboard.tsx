"use client";

import { useMemo, useState } from "react";
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
import { GetStartedModal } from "@/components/dashboard/GetStartedModal";

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
  const { activeOrg } = useAppStore();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const { data: metrics, isLoading } = useWorkspaceDashboard(orgSlug, workspaceSlug);
  const insightsState = useArchitectureInsights(orgSlug, workspaceSlug);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const userName = greetingName(user?.displayName, user?.email);
  const empty = metrics ? isWorkspaceEmpty(metrics) : true;

  if (isLoading || !metrics) {
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

  return (
    <>
      <div className="px-8 py-9 min-h-full bg-gray-50/50">
        {empty ? (
          <ZeroStateDashboard
            basePath={basePath}
            orgSlug={orgSlug}
            workspaceSlug={workspaceSlug}
            greeting={greeting}
            userName={userName}
            metrics={metrics}
            onGetStarted={() => setSetupOpen(true)}
          />
        ) : (
          <PopulatedStateDashboard
            basePath={basePath}
            greeting={greeting}
            userName={userName}
            orgName={activeOrg?.name ?? orgSlug}
            lastUpdatedLabel={formatUpdatedAgo(insightsState.analysedAt)}
            metrics={metrics}
            insights={insightsState.insights}
            onOpenInsights={() => setInsightsOpen(true)}
          />
        )}
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

      <GetStartedModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        orgSlug={orgSlug}
        workspaceSlug={workspaceSlug}
        workspaceName={activeOrg?.name ?? orgSlug}
      />
    </>
  );
}
