"use client";

import { useState } from "react";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { MetricDetailDrawer } from "@/components/dashboard/MetricDetailDrawer";
import { MetricSummaryCard } from "@/components/dashboard/MetricSummaryCard";
import { useMetricDrawerData, type MetricDrawerId } from "@/lib/use-metric-drawer-data";

type OverviewCardId = "systems" | "outside-it" | "no-system" | "no-owner";

function drawerFor(id: OverviewCardId): MetricDrawerId {
  if (id === "systems" || id === "outside-it") return "systems";
  return "capabilities";
}

interface Props {
  basePath: string;
  orgSlug: string;
  workspaceSlug: string;
  metrics: WorkspaceMetrics;
  emptyWorkspace?: boolean;
}

export function DashboardMetricsSection({
  basePath,
  orgSlug,
  workspaceSlug,
  metrics,
}: Props) {
  const [selected, setSelected] = useState<OverviewCardId | null>(null);
  const drawerMetric = selected ? drawerFor(selected) : null;
  const { data, isLoading } = useMetricDrawerData(drawerMetric, orgSlug, workspaceSlug);

  const cards: {
    id: OverviewCardId;
    label: string;
    value: number;
    subtext: string;
    warn: boolean;
  }[] = [
    { id: "systems", label: "Systems we run", value: metrics.systemCount, subtext: "in the estate", warn: false },
    {
      id: "outside-it",
      label: "Outside IT",
      value: metrics.shadowSystemCount,
      subtext: metrics.shadowSystemCount > 0 ? "not owned by IT" : "none",
      warn: metrics.shadowSystemCount > 0,
    },
    {
      id: "no-system",
      label: "Work with no system",
      value: metrics.capabilitiesWithoutSystemCount,
      subtext: metrics.capabilitiesWithoutSystemCount > 0 ? "needs a system" : "none",
      warn: metrics.capabilitiesWithoutSystemCount > 0,
    },
    {
      id: "no-owner",
      label: "Work with no owner",
      value: metrics.capabilitiesWithoutOwnerCount,
      subtext: metrics.capabilitiesWithoutOwnerCount > 0 ? "needs an owner" : "none",
      warn: metrics.capabilitiesWithoutOwnerCount > 0,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => (
          <MetricSummaryCard
            key={card.id}
            label={card.label}
            value={card.value}
            subtext={card.subtext}
            variant={card.warn ? "warn" : "default"}
            selected={selected === card.id}
            onClick={() => setSelected(card.id)}
          />
        ))}
      </div>

      <MetricDetailDrawer
        metric={drawerMetric}
        basePath={basePath}
        isLoading={isLoading}
        map={data?.map}
        systems={data?.systems}
        products={data?.products}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
