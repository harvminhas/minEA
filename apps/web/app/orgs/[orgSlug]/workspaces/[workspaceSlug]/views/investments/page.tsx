"use client";

import { ViewShell } from "@/components/views/ViewShell";
import { InvestmentPipelineView } from "@/components/views/InvestmentPipelineView";
import { getView } from "@/lib/views";

const view = getView("investments");

export default function InvestmentsViewPage() {
  return (
    <ViewShell view={view} subtitle="Rollups over roadmap items — status, category, and spend.">
      <InvestmentPipelineView />
    </ViewShell>
  );
}
