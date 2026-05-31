"use client";

import { ViewShell } from "@/components/views/ViewShell";
import { CapabilityHeatmapView } from "@/components/views/CapabilityHeatmapView";
import { getView } from "@/lib/views";

const view = getView("capability-heatmap");

export default function CapabilityHeatmapViewPage() {
  return (
    <ViewShell
      view={view}
      subtitle="Product × capability matrix colored by supporting system fitness."
    >
      <CapabilityHeatmapView />
    </ViewShell>
  );
}
