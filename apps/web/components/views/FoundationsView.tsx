"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { FlowDetail } from "@/components/integration/FlowDetail";
import { SystemObjectDetail } from "@/components/objects/SystemObjectDetail";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";
import {
  buildPlatformFoundationGroups,
  buildRuntimeFoundationGroups,
  foundationGroupHeading,
  foundationsDataFromLists,
  summarizePlatformFoundations,
  summarizeRuntimeFoundations,
  type FoundationGroup,
  type FoundationsTab,
} from "@/lib/foundations-view-utils";
import {
  IntegrationTechEvidencePanel,
  type IntegrationTechEvidenceKind,
} from "@/components/views/IntegrationTechEvidencePanel";
import {
  buildIntegrationTechGroups,
  buildManualFlowEvidence,
  buildSpofToolEvidence,
  integrationTechGroupHeading,
  INTEGRATION_TECH_EXPOSURE_CAPTION,
  summarizeIntegrationTech,
  type IntegrationTechFlowEntry,
  type IntegrationTechGroup,
} from "@/lib/tech-stack-integration-utils";
import type { MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

const PREVIEW_FLOWS = 3;

const TABS: { id: FoundationsTab; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "runtime", label: "Runtime" },
  { id: "integration", label: "Integration Tech" },
];

function MetricsSummaryBar({
  segments,
}: {
  segments: {
    key: string;
    value: string;
    subtext: string;
    subtextClassName?: string;
    active?: boolean;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden divide-x divide-gray-200">
      {segments.map((seg) => {
        const clickable = Boolean(seg.onClick);
        const Tag = clickable ? "button" : "div";

        return (
          <Tag
            key={seg.key}
            type={clickable ? "button" : undefined}
            onClick={seg.onClick}
            className={cn(
              "flex flex-1 items-baseline gap-2 px-4 py-2.5 min-w-0 text-left",
              clickable && "hover:bg-gray-50 transition-colors cursor-pointer",
              seg.active && "bg-indigo-50/80 ring-1 ring-inset ring-indigo-200"
            )}
          >
            <span className="text-xl font-bold text-gray-900 tabular-nums">{seg.value}</span>
            <span className={cn("text-xs truncate", seg.subtextClassName ?? "text-gray-500")}>
              {seg.subtext}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

function FoundationSystemPill({
  entry,
  variant,
  onClick,
}: {
  entry: FoundationGroup["systems"][number];
  variant: FoundationGroup["variant"];
  onClick: () => void;
}) {
  const label = entry.detailNote
    ? `${entry.system.name} · ${entry.detailNote}`
    : entry.system.name;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-gray-900",
        "hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-left",
        variant === "custom" && "border-red-200 text-red-900 hover:border-red-300 hover:bg-red-50/50",
        variant === "muted" && "border-gray-200 text-gray-700",
        variant === "default" && "border-gray-200"
      )}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

function IntegrationFlowPill({
  entry,
  variant,
  onClick,
}: {
  entry: IntegrationTechFlowEntry;
  variant: IntegrationTechGroup["variant"];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-gray-900",
        "hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-left",
        variant === "custom" && "border-red-200 text-red-900 hover:border-red-300 hover:bg-red-50/50",
        variant === "muted" && "border-gray-200 text-gray-700",
        variant === "default" && "border-gray-200"
      )}
    >
      <span className="truncate">{entry.pillLabel}</span>
    </button>
  );
}

function FoundationGroupSection({
  group,
  onOpenSystem,
}: {
  group: FoundationGroup;
  onOpenSystem: (system: MinEAObject) => void;
}) {
  return (
    <section className="space-y-3">
      <h3
        className={cn(
          "text-[11px] font-bold tracking-wider",
          group.variant === "custom" && "text-red-700",
          group.variant === "muted" && "text-gray-400",
          group.variant === "default" && "text-gray-500"
        )}
      >
        {foundationGroupHeading(group)}
      </h3>
      <div className="flex flex-wrap gap-2">
        {group.systems.map((entry) => (
          <FoundationSystemPill
            key={entry.system.id}
            entry={entry}
            variant={group.variant}
            onClick={() => onOpenSystem(entry.system)}
          />
        ))}
      </div>
    </section>
  );
}

function IntegrationTechGroupSection({
  group,
  onOpenFlow,
}: {
  group: IntegrationTechGroup;
  onOpenFlow: (flow: MinEAObject) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.flows : group.flows.slice(0, PREVIEW_FLOWS);
  const hiddenCount = group.flows.length - PREVIEW_FLOWS;

  return (
    <section className="space-y-3">
      <h3
        className={cn(
          "text-[11px] font-bold tracking-wider",
          group.variant === "custom" && "text-red-700",
          group.variant === "muted" && "text-gray-400",
          group.variant === "default" && "text-gray-500"
        )}
      >
        {integrationTechGroupHeading(group)}
      </h3>
      <div className="flex flex-wrap gap-2">
        {visible.map((entry) => (
          <IntegrationFlowPill
            key={entry.flow.id}
            entry={entry}
            variant={group.variant}
            onClick={() => onOpenFlow(entry.flow)}
          />
        ))}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
          >
            + {hiddenCount} more
          </button>
        )}
      </div>
    </section>
  );
}

export function FoundationsView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [tab, setTab] = useState<FoundationsTab>("platform");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<MinEAObject | null>(null);
  const [evidencePanel, setEvidencePanel] = useState<IntegrationTechEvidenceKind | null>(null);

  const query = useQuery({
    queryKey: ["foundations", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const [applications, solutions, technicalCapabilities, platforms, runtimes, flows, relationships] =
        await Promise.all([
          objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "solution" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "technical_capability" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "cloud_service" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "model" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token),
          relationshipsApi.list(orgSlug, workspaceSlug, {}, token),
        ]);

      return {
        foundations: foundationsDataFromLists({
          applications: applications.items,
          solutions: solutions.items,
          technicalCapabilities: technicalCapabilities.items,
          platforms: platforms.items,
          runtimes: runtimes.items,
          relationships,
        }),
        flows: flows.items,
      };
    },
    enabled,
  });

  const platformGroups = useMemo(
    () => (query.data ? buildPlatformFoundationGroups(query.data.foundations) : []),
    [query.data]
  );
  const runtimeGroups = useMemo(
    () => (query.data ? buildRuntimeFoundationGroups(query.data.foundations) : []),
    [query.data]
  );
  const integrationGroups = useMemo(
    () => (query.data ? buildIntegrationTechGroups(query.data.flows) : []),
    [query.data]
  );

  const platformSummary = useMemo(
    () => summarizePlatformFoundations(platformGroups),
    [platformGroups]
  );
  const runtimeSummary = useMemo(
    () => summarizeRuntimeFoundations(runtimeGroups),
    [runtimeGroups]
  );
  const integrationSummary = useMemo(
    () => (query.data ? summarizeIntegrationTech(query.data.flows) : null),
    [query.data]
  );
  const spofEvidence = useMemo(
    () => (query.data ? buildSpofToolEvidence(query.data.flows) : []),
    [query.data]
  );
  const manualEvidence = useMemo(
    () => (query.data ? buildManualFlowEvidence(query.data.flows) : []),
    [query.data]
  );

  const selectedSystem = useMemo(() => {
    if (!selectedSystemId || !query.data) return null;
    return query.data.foundations.systems.find((s) => s.id === selectedSystemId) ?? null;
  }, [selectedSystemId, query.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["foundations", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
  };

  const openFlowFromEvidence = (flow: MinEAObject) => {
    setEvidencePanel(null);
    setSelectedFlow(flow);
  };

  if (query.isLoading || query.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-gray-200 bg-white">
        <Loader2 className="h-9 w-9 animate-spin text-indigo-600" />
        <p className="mt-4 text-sm font-medium text-gray-700">Loading tech stack…</p>
      </div>
    );
  }

  const kpiSegments =
    tab === "platform"
      ? [
          { key: "mapped", value: String(platformSummary.systemsMapped), subtext: "systems mapped" },
          {
            key: "custom",
            value: String(platformSummary.customDevelopment),
            subtext: "custom development",
            subtextClassName: "text-red-600",
          },
          {
            key: "types",
            value: String(platformSummary.foundationTypesInUse),
            subtext: "platform types in use",
          },
        ]
      : tab === "runtime"
        ? [
            { key: "mapped", value: String(runtimeSummary.systemsMapped), subtext: "systems mapped" },
            {
              key: "onprem",
              value: String(runtimeSummary.customDevelopment),
              subtext: "on-prem / bare metal",
              subtextClassName: "text-red-600",
            },
            {
              key: "types",
              value: String(runtimeSummary.foundationTypesInUse),
              subtext: "runtime types in use",
            },
          ]
        : integrationSummary
          ? [
              {
                key: "mapped",
                value: String(integrationSummary.flowsMapped),
                subtext: "flows mapped",
              },
              {
                key: "spof",
                value: String(integrationSummary.singlePointOfFailureToolCount),
                subtext: "single point of failure tool",
                subtextClassName: "text-red-600",
                active: evidencePanel === "spof",
                onClick: () => setEvidencePanel("spof"),
              },
              {
                key: "manual",
                value: String(integrationSummary.manualFlowCount),
                subtext: "no tooling (ad hoc)",
                subtextClassName: "text-red-600",
                active: evidencePanel === "manual",
                onClick: () => setEvidencePanel("manual"),
              },
            ]
          : [];

  const isEmpty =
    tab === "integration"
      ? (integrationSummary?.flowsMapped ?? 0) === 0
      : tab === "platform"
        ? platformSummary.totalSystems === 0
        : runtimeSummary.totalSystems === 0;

  const groups =
    tab === "platform" ? platformGroups : tab === "runtime" ? runtimeGroups : integrationGroups;

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="border-b border-gray-200">
          <nav className="flex gap-6" aria-label="Tech stack tabs">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "pb-2.5 text-sm font-semibold border-b-2 transition-colors",
                  tab === id
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <MetricsSummaryBar segments={kpiSegments} />

        {tab === "integration" && integrationSummary && (
          <p className="text-xs text-gray-500 leading-relaxed -mt-1">
            {INTEGRATION_TECH_EXPOSURE_CAPTION}
            {integrationSummary.fileBasedFlowCount > 0 && (
              <>
                {" "}
                File-based flows: {integrationSummary.fileBasedFlowCount} (counted separately from
                ad hoc manual).
              </>
            )}
          </p>
        )}

        {isEmpty ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm">
              {tab === "integration"
                ? "No integration flows in the repository yet."
                : "No systems in the repository yet."}
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm">No tech stack mapping to show.</p>
          </div>
        ) : tab === "integration" ? (
          <div className="space-y-8">
            {(groups as IntegrationTechGroup[]).map((group) => (
              <IntegrationTechGroupSection
                key={group.key}
                group={group}
                onOpenFlow={setSelectedFlow}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {(groups as FoundationGroup[]).map((group) => (
              <FoundationGroupSection
                key={group.key}
                group={group}
                onOpenSystem={(system) => setSelectedSystemId(system.id)}
              />
            ))}
          </div>
        )}
      </div>

      {evidencePanel && (
        <IntegrationTechEvidencePanel
          kind={evidencePanel}
          spofEvidence={spofEvidence}
          manualEvidence={manualEvidence}
          onClose={() => setEvidencePanel(null)}
          onOpenFlow={openFlowFromEvidence}
        />
      )}

      {selectedSystem && (
        <SystemObjectDetail
          objectId={selectedSystem.id}
          accentColor={APPLICATION_LAYER_COLOR}
          onClose={() => setSelectedSystemId(null)}
          onUpdate={refresh}
        />
      )}

      {selectedFlow && (
        <FlowDetail
          flow={selectedFlow}
          onClose={() => setSelectedFlow(null)}
          onDelete={refresh}
          onUpdate={refresh}
        />
      )}
    </>
  );
}
