"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Clock, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateFlowPanel } from "@/components/integration/CreateFlowPanel";
import { FlowDetail } from "@/components/integration/FlowDetail";
import {
  API_CRITICALITY_LABEL,
  API_CRITICALITY_STYLE,
  API_STATUS_STYLE,
} from "@/lib/api-utils";
import {
  FLOW_AUTH_LABEL,
  FLOW_CRITICALITY_LABEL,
  flowDestinationLine,
  flowSourceLine,
  formatFlowSubtitle,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/flow-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";

function PropertyRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={cn("text-right truncate max-w-[60%] font-medium text-gray-900", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function FlowCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as IntegrationFlowProperties;
  const status = item.status ?? "planned";
  const criticality = props.criticality ?? "low";
  const authLabel = props.auth ? (FLOW_AUTH_LABEL[props.auth] ?? props.auth) : "—";
  const sourceLine = flowSourceLine(props);
  const destLine = flowDestinationLine(props);

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-teal-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-700">
            <ArrowLeftRight size={16} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{formatFlowSubtitle(props.protocol)}</p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
            API_STATUS_STYLE[status] ?? API_STATUS_STYLE.planned
          )}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow
          label="Source"
          value={sourceLine}
          valueClassName={sourceLine === "—" ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Destination"
          value={destLine}
          valueClassName={destLine === "—" ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Auth"
          value={authLabel}
          valueClassName={!props.auth ? "font-normal text-gray-400" : undefined}
        />
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="text-gray-400 flex-shrink-0">Criticality</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
              API_CRITICALITY_STYLE[criticality] ?? API_CRITICALITY_STYLE.low
            )}
          >
            {FLOW_CRITICALITY_LABEL[criticality] ?? API_CRITICALITY_LABEL[criticality] ?? criticality}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{item.updated_by_name ? ` by ` : " "}
          {item.updated_by_name && (
            <span className="font-semibold text-gray-600">{item.updated_by_name}</span>
          )}
          {item.updated_by_name ? " " : ""}
          {formatUpdatedAgo(item.updated_at)}
        </span>
      </div>
    </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <div
                className="mx-auto h-12 w-12 rounded-xl flex items-center justify-center text-teal-700 bg-teal-50 mb-4"
              >
                <ArrowLeftRight size={20} strokeWidth={2.25} />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <FlowCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
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
          onUpdate={refresh}
        />
      )}
    </>
  );
}
