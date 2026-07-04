"use client";

import { useState } from "react";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { metricCardStates, zeroStateMetricCardStates } from "@/lib/workspace-dashboard";
import { MetricDetailDrawer } from "@/components/dashboard/MetricDetailDrawer";
import { MetricSummaryCard } from "@/components/dashboard/MetricSummaryCard";
import { useMetricDrawerData, type MetricDrawerId } from "@/lib/use-metric-drawer-data";

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
  emptyWorkspace = false,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricDrawerId | null>(null);
  const cards = emptyWorkspace ? zeroStateMetricCardStates() : metricCardStates(metrics);

  const { data, isLoading } = useMetricDrawerData(selectedMetric, orgSlug, workspaceSlug);

  const cardProps = [
    { id: "systems" as const, label: "Systems", value: metrics.systemCount, ...cards.systems },
    { id: "domains" as const, label: "Domains", value: metrics.domainCount, ...cards.domains },
    {
      id: "capabilities" as const,
      label: "Capabilities",
      value: metrics.capabilityCount,
      ...cards.capabilities,
    },
    { id: "products" as const, label: "Products", value: metrics.productCount, ...cards.products },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cardProps.map((card) => (
          <MetricSummaryCard
            key={card.id}
            label={card.label}
            value={card.value}
            subtext={card.subtext}
            variant={card.variant}
            selected={selectedMetric === card.id}
            onClick={() => setSelectedMetric(card.id)}
          />
        ))}
      </div>

      <MetricDetailDrawer
        metric={selectedMetric}
        basePath={basePath}
        isLoading={isLoading}
        map={data?.map}
        systems={data?.systems}
        products={data?.products}
        onClose={() => setSelectedMetric(null)}
      />
    </>
  );
}
