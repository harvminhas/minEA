"use client";

import dynamic from "next/dynamic";
import type { SharePreview } from "@minea/types";
import { ViewEmbedProvider } from "@/lib/view-embed-context";
import { RoadmapDetailContent } from "@/components/strategy/RoadmapDetailContent";
import { CapabilityMapPage } from "@/components/capability-map/CapabilityMapPage";
import { DomainDetailPage } from "@/components/capability-map/DomainDetailPage";
import { SystemObjectDetail } from "@/components/objects/SystemObjectDetail";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";

const VIEW_PAGES: Record<string, React.ComponentType> = {
  "views/products": dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/products/page")),
  "views/journeys": dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/journeys/page")),
  "views/capability-heatmap": dynamic(
    () => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/capability-heatmap/page")
  ),
  "views/investments": dynamic(
    () => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/investments/page")
  ),
  "views/tech-debt": dynamic(() => import("@/app/orgs/[orgSlug]/workspaces/[workspaceSlug]/views/tech-debt/page")),
};

export function ShareContent({ preview }: { preview: SharePreview }) {
  if (preview.resource_type === "view" && preview.resource_key) {
    const ViewPage = VIEW_PAGES[preview.resource_key];
    if (!ViewPage) {
      return <p className="text-sm text-gray-500 p-8">This view cannot be shared yet.</p>;
    }
    return (
      <ViewEmbedProvider embedded>
        <ViewPage />
      </ViewEmbedProvider>
    );
  }

  if (preview.resource_type === "roadmap" && preview.resource_id) {
    return <RoadmapDetailContent roadmapId={preview.resource_id} layout="page" />;
  }

  if (preview.resource_type === "capability_map") {
    return <CapabilityMapPage />;
  }

  if (preview.resource_type === "capability_domain" && preview.resource_id) {
    return <DomainDetailPage domainId={preview.resource_id} />;
  }

  if (preview.resource_type === "object" && preview.resource_id) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <SystemObjectDetail
          objectId={preview.resource_id}
          accentColor={APPLICATION_LAYER_COLOR}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      </div>
    );
  }

  return <p className="text-sm text-gray-500 p-8">Unsupported share type.</p>;
}
