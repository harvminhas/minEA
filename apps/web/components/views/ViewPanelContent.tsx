"use client";

import type { ViewId } from "@/lib/views";
import { ViewEmbedProvider } from "@/lib/view-embed-context";
import {
  CapabilityHeatmapViewPanel,
  InvestmentsViewPanel,
  JourneysViewPanel,
  ProcessesViewPanel,
  ProductsViewPanel,
  TechDebtViewPanel,
  IntegrationHealthViewPanel,
  FoundationsViewPanel,
} from "@/components/views/ViewPanels";

const VIEW_PANELS: Record<ViewId, React.ComponentType> = {
  products: ProductsViewPanel,
  journeys: JourneysViewPanel,
  processes: ProcessesViewPanel,
  "capability-heatmap": CapabilityHeatmapViewPanel,
  investments: InvestmentsViewPanel,
  "tech-debt": TechDebtViewPanel,
  "integration-health": IntegrationHealthViewPanel,
  foundations: FoundationsViewPanel,
};

export function ViewPanelContent({ viewId }: { viewId: ViewId }) {
  const ViewPanel = VIEW_PANELS[viewId];

  return (
    <ViewEmbedProvider embedded>
      <div className="h-full min-h-full overflow-y-auto bg-violet-50">
        <ViewPanel />
      </div>
    </ViewEmbedProvider>
  );
}
