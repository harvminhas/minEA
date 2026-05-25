"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DomainDetail, Process } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { processesApi } from "@/lib/api-client";
import { ProcessBuilder } from "@/components/views/ProcessBuilder";
import { useTenancy } from "@/lib/tenancy";

interface LinkedProcess {
  process: Process;
  linkedCapabilities: { id: string; name: string }[];
  linkedStageCount: number;
}

function linkProcessesToDomain(processes: Process[], domain: DomainDetail): LinkedProcess[] {
  const domainCapIds = new Set(domain.capabilities.map((cap) => cap.id));
  const capNames = new Map(domain.capabilities.map((cap) => [cap.id, cap.name]));

  return processes
    .map((process) => {
      const linkedCapIds = new Set<string>();
      let linkedStageCount = 0;

      for (const stage of process.stages) {
        const stageCaps = stage.capability_ids.filter((id) => domainCapIds.has(id));
        if (stageCaps.length > 0) {
          linkedStageCount += 1;
          for (const id of stageCaps) linkedCapIds.add(id);
        }
      }

      if (linkedCapIds.size === 0) return null;

      return {
        process,
        linkedCapabilities: [...linkedCapIds]
          .map((id) => ({ id, name: capNames.get(id) ?? "Capability" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        linkedStageCount,
      };
    })
    .filter((item): item is LinkedProcess => item !== null)
    .sort((a, b) => a.process.name.localeCompare(b.process.name));
}

interface Props {
  domain: DomainDetail;
}

export function DomainProcessesTab({ domain }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [selectedProcess, setSelectedProcess] = useState<Process | undefined>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["processes", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return processesApi.list(orgSlug, workspaceSlug, token!);
    },
  });

  const linkedProcesses = useMemo(
    () => linkProcessesToDomain(data?.items ?? [], domain),
    [data?.items, domain]
  );

  if (isLoading) {
    return <p className="p-8 text-sm text-gray-400">Loading processes…</p>;
  }

  if (linkedProcesses.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-gray-900">No linked processes</h2>
          <p className="text-sm text-gray-500 mt-2">
            Processes appear here when a stage links to a capability in {domain.name}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-8">
        <p className="text-sm text-gray-500 mb-4">
          {linkedProcesses.length} process{linkedProcesses.length === 1 ? "" : "es"} use capabilities from{" "}
          {domain.name}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {linkedProcesses.map(({ process, linkedCapabilities, linkedStageCount }) => (
            <button
              key={process.id}
              type="button"
              onClick={() => setSelectedProcess(process)}
              className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-200 transition-colors w-full"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{process.name}</h3>
                  {process.owner && (
                    <p className="text-xs text-gray-400 mt-0.5">Owner · {process.owner}</p>
                  )}
                </div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 capitalize flex-shrink-0">
                  {process.status}
                </span>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                {linkedStageCount} linked stage{linkedStageCount === 1 ? "" : "s"} ·{" "}
                {linkedCapabilities.length} capabilit
                {linkedCapabilities.length === 1 ? "y" : "ies"} in this domain
              </p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {linkedCapabilities.map((cap) => (
                  <span
                    key={cap.id}
                    className="inline-block rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800"
                  >
                    {cap.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedProcess && (
        <ProcessBuilder
          initialValues={selectedProcess}
          onClose={() => {
            setSelectedProcess(undefined);
            refetch();
          }}
        />
      )}
    </>
  );
}
