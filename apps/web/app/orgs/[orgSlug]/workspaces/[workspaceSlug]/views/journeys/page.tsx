"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { journeysApi } from "@/lib/api-client";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { useViewDataGate } from "@/lib/use-view-summary";
import { ViewShell } from "@/components/views/ViewShell";
import { JourneyBuilder } from "@/components/views/JourneyBuilder";
import { getView } from "@/lib/views";
import type { Journey } from "@minea/types";

const view = getView("journeys");

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

export default function JourneysViewPage() {
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
                  setEditJourney(journey);
                  setShowBuilder(true);
                }}
              />
            ))}
          </div>
        )}
      </ViewShell>

      {showBuilder && (
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
