"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Braces, Clock, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateApiPanel } from "@/components/integration/CreateApiPanel";
import { ApiDetail } from "@/components/integration/ApiDetail";
import {
  API_AUTH_LABEL,
  API_CRITICALITY_LABEL,
  API_CRITICALITY_STYLE,
  API_STATUS_STYLE,
  formatApiSubtitle,
  formatConsumersLine,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/api-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { ApiProperties, MinEAObject } from "@minea/types";
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

function ApiCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as ApiProperties;
  const consumers = props.consumers ?? [];
  const status = item.status ?? "planned";
  const authLabel = props.auth ? (API_AUTH_LABEL[props.auth] ?? props.auth) : "—";
  const criticality = props.criticality ?? "low";

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-teal-300 hover:shadow-sm cursor-pointer transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-700">
            <Braces size={16} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{formatApiSubtitle(props.protocol)}</p>
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

      {/* Key-value rows with dividers */}
      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow
          label="Provider"
          value={props.provider?.provider_name ?? "—"}
          valueClassName={!props.provider ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Consumers"
          value={formatConsumersLine(consumers)}
          valueClassName={consumers.length === 0 ? "font-normal text-gray-400" : undefined}
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
            {API_CRITICALITY_LABEL[criticality] ?? criticality}
          </span>
        </div>
      </div>

      {/* Footer */}
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

export function ApiList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const apisQueryKey = ["objects", orgSlug, workspaceSlug, "api"] as const;

  const { data, isLoading } = useQuery({
    queryKey: apisQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "api" }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: apisQueryKey });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${INTEGRATION_LAYER_COLOR}20`, color: INTEGRATION_LAYER_COLOR }}
          >
            Integration Layer
          </span>
          <h1 className="text-lg font-semibold text-gray-900">APIs</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New API
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
            <p className="text-gray-400 text-sm mb-3">No APIs yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-teal-600 hover:underline text-sm">
              Create the first API →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <ApiCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateApiPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <ApiDetail
          api={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            setSelectedId(null);
            refresh();
          }}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
