"use client";

import { ViewShell } from "@/components/views/ViewShell";
import { getView } from "@/lib/views";

const view = getView("capability-heatmap");

export default function CapabilityHeatmapViewPage() {
  return <ViewShell view={view} isEmpty />;
}
