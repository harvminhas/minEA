"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateFlowPanel } from "@/components/integration/CreateFlowPanel";
import { FlowDetail } from "@/components/integration/FlowDetail";
import { INTEGRATION_LAYER_COLOR, FLOW_PROTOCOLS, FLOW_FREQUENCIES } from "@/lib/flow-utils";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

const PROTOCOL_LABEL: Record<string, string> = Object.fromEntries(
  FLOW_PROTOCOLS.map((p) => [p.value, p.label])
);
const FREQ_LABEL: Record<string, string> = Object.fromEntries(
  FLOW_FREQUENCIES.map((f) => [f.value, f.label])
);
const CRIT_COLOR: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

function FlowCard({
  item,
  onOpenDetail,
}: {
  item: MinEAObject;
  onOpenDetail: () => void;
}) {
  const props = (item.properties ?? {}) as IntegrationFlowProperties;
  const srcSystems = props.sources?.systems ?? [];
  const dstSystems = props.destinations?.systems ?? [];
  const srcCount = srcSystems.length + (props.sources?.entities?.length ?? 0);
  const dstCount = dstSystems.length + (props.destinations?.entities?.length ?? 0);
  const hasEndpoints = srcCount > 0 || dstCount > 0;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="text-left bg-white rounded-xl border border-gray-200 hover:border-teal-200 transition-colors w-full p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: INTEGRATION_LAYER_COLOR }}
        >
          <ArrowLeftRight size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate leading-tight">
            {item.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {props.protocol && (
              <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                {PROTOCOL_LABEL[props.protocol] ?? props.protocol}
              </span>
            )}
            {props.frequency && (
              <span className="text-[10px] text-gray-500">
                {FREQ_LABEL[props.frequency] ?? props.frequency}
              </span>
            )}
            {props.criticality && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize",
                  CRIT_COLOR[props.criticality] ?? "bg-gray-100 text-gray-600"
                )}
              >
                {props.criticality}
              </span>
            )}
          </div>

          {hasEndpoints && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <div className="flex-1 flex items-center gap-1 overflow-hidden">
                {srcSystems.slice(0, 2).map((s) => (
                  <span
                    key={s.system_id}
                    className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-[80px]"
                  >
                    {s.system_name}
                  </span>
                ))}
                {srcCount > 2 && (
                  <span className="text-[10px] text-gray-400">+{srcCount - 2}</span>
                )}
              </div>
              <ArrowLeftRight size={11} className="text-teal-400 flex-shrink-0" />
              <div className="flex-1 flex items-center gap-1 overflow-hidden justify-end">
                {dstSystems.slice(0, 2).map((s) => (
                  <span
                    key={s.system_id}
                    className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-[80px]"
                  >
                    {s.system_name}
                  </span>
                ))}
                {dstCount > 2 && (
                  <span className="text-[10px] text-gray-400">+{dstCount - 2}</span>
                )}
              </div>
            </div>
          )}

          {item.owner && (
            <p className="text-[10px] text-gray-400 truncate mt-2">Owner: {item.owner}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function FlowList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flowsQueryKey = ["objects", orgSlug, workspaceSlug, "integration_flow"] as const;

  const { data, isLoading } = useQuery({
    queryKey: flowsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: flowsQueryKey });
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{
                backgroundColor: `${INTEGRATION_LAYER_COLOR}20`,
                color: INTEGRATION_LAYER_COLOR,
              }}
            >
              Integration Layer
            </span>
            <h1 className="text-lg font-semibold text-gray-900">Flows</h1>
            {data && (
              <span className="text-sm text-gray-400">
                {data.total} {data.total === 1 ? "flow" : "flows"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-md text-sm font-medium"
          >
            <Plus size={14} />
            New flow
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <div
                className="mx-auto h-12 w-12 rounded-xl flex items-center justify-center text-white mb-4"
                style={{ backgroundColor: INTEGRATION_LAYER_COLOR }}
              >
                <ArrowLeftRight size={20} />
              </div>
              <p className="text-gray-400 text-sm mb-3">No integration flows yet.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-teal-600 hover:underline text-sm"
              >
                Create your first flow →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <FlowCard
                  key={item.id}
                  item={item}
                  onOpenDetail={() => setSelectedId(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateFlowPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <FlowDetail
          flow={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            refresh();
            setSelectedId(null);
          }}
          onUpdate={() => {
            refresh();
          }}
        />
      )}
    </>
  );
}
