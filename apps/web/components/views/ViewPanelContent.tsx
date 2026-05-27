"use client";

import dynamic from "next/dynamic";
import type { ViewId } from "@/lib/views";
import { ViewEmbedProvider } from "@/lib/view-embed-context";

const VIEW_PAGES: Record<ViewId, React.ComponentType> = {
  products: dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/products/page")),
  journeys: dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/journeys/page")),
  processes: dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/processes/page")),
  "capability-heatmap": dynamic(
    () => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/capability-heatmap/page")
  ),
  investments: dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/investments/page")),
  "ai-infrastructure": dynamic(
    () => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/ai-infrastructure/page")
  ),
  insights: dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/insights/page")),
};

export function ViewPanelContent({ viewId }: { viewId: ViewId }) {
  const ViewPage = VIEW_PAGES[viewId];

  return (
    <ViewEmbedProvider embedded>
      <div className="h-full overflow-y-auto bg-gray-50">
        <ViewPage />
      </div>
    </ViewEmbedProvider>
  );
}
