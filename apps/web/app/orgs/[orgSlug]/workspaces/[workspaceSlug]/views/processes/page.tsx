"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { processesApi } from "@/lib/api-client";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { useViewDataGate } from "@/lib/use-view-summary";
import { ViewShell } from "@/components/views/ViewShell";
import { ProcessBuilder } from "@/components/views/ProcessBuilder";
import { getView } from "@/lib/views";
import type { Process } from "@minea/types";

const view = getView("processes");

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

export default function ProcessesViewPage() {
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
                  setEditProcess(process);
                  setShowBuilder(true);
                }}
              />
            ))}
          </div>
        )}
      </ViewShell>

      {showBuilder && (
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
