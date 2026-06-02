"use client";

import { useState } from "react";
import type { AiInsight } from "@minea/types";
import type { WorkspaceMetrics } from "@/lib/workspace-dashboard";
import { metricSubtexts } from "@/lib/workspace-dashboard";
import { MetricDetailDrawer } from "@/components/dashboard/MetricDetailDrawer";
import { MetricSummaryCard } from "@/components/dashboard/MetricSummaryCard";
import { useMetricDrawerData, type MetricDrawerId } from "@/lib/use-metric-drawer-data";

interface Props {
  basePath: string;
  orgSlug: string;
  workspaceSlug: string;
  metrics: WorkspaceMetrics;
  insights?: AiInsight[];
}

export function DashboardMetricsSection({
  basePath,
  orgSlug,
  workspaceSlug,
  metrics,
  insights = [],
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricDrawerId | null>(null);
  const subtexts = metricSubtexts(metrics, insights);

  const domainsWarn =
    metrics.domainCount > 0 &&
    (subtexts.domains.includes("incomplete") || metrics.capabilityCount === 0);

  const productsWarn =
    subtexts.products.includes("incomplete") || subtexts.products === "none yet";

  const { data, isLoading } = useMetricDrawerData(selectedMetric, orgSlug, workspaceSlug);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricSummaryCard
          label="Domains"
          value={metrics.domainCount}
          subtext={subtexts.domains}
          variant={domainsWarn ? "warn" : "default"}
          selected={selectedMetric === "domains"}
          onClick={() => setSelectedMetric("domains")}
        />
        <MetricSummaryCard
          label="Capabilities"
          value={metrics.capabilityCount}
          subtext={subtexts.capabilities}
          selected={selectedMetric === "capabilities"}
          onClick={() => setSelectedMetric("capabilities")}
        />
        <MetricSummaryCard
          label="Systems"
          value={metrics.systemCount}
          subtext={subtexts.systems}
          selected={selectedMetric === "systems"}
          onClick={() => setSelectedMetric("systems")}
        />
        <MetricSummaryCard
          label="Products"
          value={metrics.productCount}
          subtext={subtexts.products}
          variant={productsWarn ? "warn" : "default"}
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
