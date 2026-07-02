"use client";

import { useState } from "react";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { metricCardStates } from "@/lib/workspace-dashboard";
import { MetricDetailDrawer } from "@/components/dashboard/MetricDetailDrawer";
import { MetricSummaryCard } from "@/components/dashboard/MetricSummaryCard";
import { useMetricDrawerData, type MetricDrawerId } from "@/lib/use-metric-drawer-data";

interface Props {
  basePath: string;
  orgSlug: string;
  workspaceSlug: string;
  metrics: WorkspaceMetrics;
}

export function DashboardMetricsSection({
  basePath,
  orgSlug,
  workspaceSlug,
  metrics,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricDrawerId | null>(null);
  const cards = metricCardStates(metrics);

  const { data, isLoading } = useMetricDrawerData(selectedMetric, orgSlug, workspaceSlug);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricSummaryCard
          label="Domains"
          value={metrics.domainCount}
          subtext={cards.domains.subtext}
          variant={cards.domains.variant}
          selected={selectedMetric === "domains"}
          onClick={() => setSelectedMetric("domains")}
        />
        <MetricSummaryCard
          label="Capabilities"
          value={metrics.capabilityCount}
          subtext={cards.capabilities.subtext}
          variant={cards.capabilities.variant}
          selected={selectedMetric === "capabilities"}
          onClick={() => setSelectedMetric("capabilities")}
        />
        <MetricSummaryCard
          label="Systems"
          value={metrics.systemCount}
          subtext={cards.systems.subtext}
          variant={cards.systems.variant}
          selected={selectedMetric === "systems"}
          onClick={() => setSelectedMetric("systems")}
        />
        <MetricSummaryCard
          label="Products"
          value={metrics.productCount}
          subtext={cards.products.subtext}
          variant={cards.products.variant}
          selected={selectedMetric === "products"}
          onClick={() => setSelectedMetric("products")}
        />
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
