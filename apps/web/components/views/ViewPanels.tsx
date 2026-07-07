"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { journeysApi, processesApi } from "@/lib/api-client";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { useViewDataGate } from "@/lib/use-view-summary";
import { getView } from "@/lib/views";
import { usePermissions } from "@/lib/use-permissions";
import type { Journey, Process } from "@minea/types";
import { ViewShell } from "@/components/views/ViewShell";
import { PortfolioView } from "@/components/views/PortfolioView";
import { CapabilityHeatmapView } from "@/components/views/CapabilityHeatmapView";
import { InvestmentPipelineView } from "@/components/views/InvestmentPipelineView";
import { TechDebtView } from "@/components/views/TechDebtView";
import { IntegrationHealthView } from "@/components/views/IntegrationHealthView";
import { FoundationsView } from "@/components/views/FoundationsView";
import { JourneyBuilder } from "@/components/views/JourneyBuilder";
import { ProcessBuilder } from "@/components/views/ProcessBuilder";

export function ProductsViewPanel() {
  return <PortfolioView />;
}

export function CapabilityHeatmapViewPanel() {
  const view = getView("capability-heatmap");
  return (
    <ViewShell
      view={view}
      subtitle="Product × capability matrix colored by supporting system fitness."
    >
      <CapabilityHeatmapView />
    </ViewShell>
  );
}

function JourneyCard({ journey, onClick }: { journey: Journey; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-200/80 p-5 hover:border-indigo-200 transition-colors w-full"
    >
      <h3 className="font-semibold text-gray-900 truncate">{journey.name}</h3>
      {journey.owner && <p className="text-xs text-gray-400 mt-0.5">Owner · {journey.owner}</p>}
      {journey.customer_segment && (
        <p className="text-xs text-gray-400 mt-0.5">Segment · {journey.customer_segment}</p>
      )}
      <p className="text-xs text-gray-500 mt-2">
        {journey.step_count} step{journey.step_count === 1 ? "" : "s"} ·{" "}
        {journey.process_count} linked process{journey.process_count === 1 ? "" : "es"}
      </p>
      <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 capitalize">
        {journey.status}
      </span>
    </button>
  );
}

export function JourneysViewPanel() {
  const view = getView("journeys");
  const { canCreate, canEdit } = usePermissions();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { orgSlug, workspaceSlug, summaryPending, showEmptyFromSummary, skipHeavyFetch } =
    useViewDataGate("journeys");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editJourney, setEditJourney] = useState<Journey | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["journeys", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return journeysApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled: !skipHeavyFetch,
  });

  const journeys = data?.items ?? [];
  const listLoading = !skipHeavyFetch && isLoading;

  const subtitle =
    journeys.length > 0
      ? `${journeys.length} journey${journeys.length === 1 ? "" : "s"}`
      : view.anchorQuestion;

  const openCreate = () => {
    setEditJourney(undefined);
    setShowBuilder(true);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["journeys", orgSlug, workspaceSlug] });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
  };

  return (
    <>
      <ViewShell
        view={view}
        subtitle={subtitle}
        isEmpty={showEmptyFromSummary || (!listLoading && !summaryPending && journeys.length === 0)}
        onEmptyAction={openCreate}
        headerAction={
          journeys.length > 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Add
            </button>
          ) : undefined
        }
      >
        {listLoading || summaryPending ? (
          <p className="text-sm text-gray-400">Loading journeys…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {journeys.map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                onClick={() => {
                  if (!canEdit) return;
                  setEditJourney(journey);
                  setShowBuilder(true);
                }}
              />
            ))}
          </div>
        )}
      </ViewShell>

      {showBuilder && (editJourney ? canEdit : canCreate) && (
        <JourneyBuilder
          initialValues={editJourney}
          onClose={() => {
            setShowBuilder(false);
            setEditJourney(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ProcessCard({ process, onClick }: { process: Process; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-200/80 p-5 hover:border-indigo-200 transition-colors w-full"
    >
      <h3 className="font-semibold text-gray-900 truncate">{process.name}</h3>
      {process.owner && <p className="text-xs text-gray-400 mt-0.5">Owner · {process.owner}</p>}
      <p className="text-xs text-gray-500 mt-2">
        {process.stage_count} stage{process.stage_count === 1 ? "" : "s"} ·{" "}
        {process.capability_count} capabilit{process.capability_count === 1 ? "y" : "ies"}
      </p>
      <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 capitalize">
        {process.status}
      </span>
    </button>
  );
}

export function ProcessesViewPanel() {
  const view = getView("processes");
  const { canCreate, canEdit } = usePermissions();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { orgSlug, workspaceSlug, summaryPending, showEmptyFromSummary, skipHeavyFetch } =
    useViewDataGate("processes");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editProcess, setEditProcess] = useState<Process | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["processes", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return processesApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled: !skipHeavyFetch,
  });

  const processes = data?.items ?? [];
  const listLoading = !skipHeavyFetch && isLoading;

  const subtitle =
    processes.length > 0
      ? `${processes.length} process${processes.length === 1 ? "" : "es"}`
      : view.anchorQuestion;

  const openCreate = () => {
    setEditProcess(undefined);
    setShowBuilder(true);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["processes", orgSlug, workspaceSlug] });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
  };

  return (
    <>
      <ViewShell
        view={view}
        subtitle={subtitle}
        isEmpty={showEmptyFromSummary || (!listLoading && !summaryPending && processes.length === 0)}
        onEmptyAction={openCreate}
        headerAction={
          processes.length > 0 ? (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Add
            </button>
          ) : undefined
        }
      >
        {listLoading || summaryPending ? (
          <p className="text-sm text-gray-400">Loading processes…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {processes.map((process) => (
              <ProcessCard
                key={process.id}
                process={process}
                onClick={() => {
                  if (!canEdit) return;
                  setEditProcess(process);
                  setShowBuilder(true);
                }}
              />
            ))}
          </div>
        )}
      </ViewShell>

      {showBuilder && (editProcess ? canEdit : canCreate) && (
        <ProcessBuilder
          initialValues={editProcess}
          onClose={() => {
            setShowBuilder(false);
            setEditProcess(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}

export function InvestmentsViewPanel() {
  const view = getView("investments");
  return (
    <ViewShell view={view} subtitle="Rollups over roadmap items — status, category, and spend.">
      <InvestmentPipelineView />
    </ViewShell>
  );
}

export function TechDebtViewPanel() {
  const view = getView("tech-debt");
  const [showCreate, setShowCreate] = useState(false);

  return (
    <ViewShell
      view={view}
      subtitle="All open debt items across systems, components, and platforms."
      headerAction={
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add debt item
        </button>
      }
    >
      <TechDebtView createOpen={showCreate} onCreateOpenChange={setShowCreate} />
    </ViewShell>
  );
}

export function IntegrationHealthViewPanel() {
  const view = getView("integration-health");

  return (
    <ViewShell
      view={view}
      subtitle="Every API, event, and data flow across your estate, and where it depends on people."
    >
      <IntegrationHealthView />
    </ViewShell>
  );
}

export function FoundationsViewPanel() {
  const view = getView("foundations");

  return (
    <ViewShell
      view={view}
      subtitle="What your estate is built on, where it runs, and what carries data between systems."
    >
      <FoundationsView />
    </ViewShell>
  );
}
