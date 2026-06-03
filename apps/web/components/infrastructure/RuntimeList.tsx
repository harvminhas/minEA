"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Cpu, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import { RuntimeDetail } from "@/components/infrastructure/RuntimeDetail";
import {
  formatRuntimeSubtitle,
  isComputeRuntime,
  RUNTIME_COST_MODEL_LABEL,
  RUNTIME_HOSTING_LABEL,
  RUNTIME_ICON_STYLE,
  runtimeProviderLabel,
  TECHNOLOGY_LAYER_COLOR,
} from "@/lib/runtime-utils";
import {
  criticalityBadgeStyle,
  criticalityCardLabel,
  formatAnnualCostDisplay,
  labelFromMap,
  lifecycleBadgeStyle,
  lifecycleCardLabel,
} from "@/lib/technology-card-utils";
import { PLATFORM_SLA_LABEL } from "@/lib/platform-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { MinEAObject, ModelProperties } from "@minea/types";
import { cn } from "@/lib/utils";

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

function RuntimeCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as ModelProperties;
  const lifecycle = props.lifecycle;
  const lifecycleLabel = lifecycleCardLabel(lifecycle);
  const criticality = props.criticality ?? "low";

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
              RUNTIME_ICON_STYLE
            )}
          >
            <Cpu size={16} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{formatRuntimeSubtitle(props)}</p>
          </div>
        </div>
        {lifecycleLabel && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0",
              lifecycleBadgeStyle(lifecycle)
            )}
          >
            {lifecycleLabel}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow
          label="Provider"
          value={runtimeProviderLabel(props.runtime_provider) || "—"}
          valueClassName={!props.runtime_provider ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Hosting model"
          value={labelFromMap(props.hosting_model, RUNTIME_HOSTING_LABEL)}
          valueClassName={!props.hosting_model ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Cost model"
          value={labelFromMap(props.cost_model, RUNTIME_COST_MODEL_LABEL)}
          valueClassName={!props.cost_model ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="SLA target"
          value={labelFromMap(props.sla_target, PLATFORM_SLA_LABEL)}
          valueClassName={!props.sla_target ? "font-normal text-gray-400" : undefined}
        />
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="text-gray-400 flex-shrink-0">Criticality</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
              criticalityBadgeStyle(criticality)
            )}
          >
            {criticalityCardLabel(criticality)}
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

export function RuntimeList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const runtimeQueryKey = ["objects", orgSlug, workspaceSlug, "compute_runtime"] as const;

  const { data, isLoading } = useQuery({
    queryKey: runtimeQueryKey,
    queryFn: async () => {
      const token = await getToken();
      const result = await objectsApi.list(orgSlug, workspaceSlug, { type: "model" }, token!);
      const items = result.items.filter((t) => isComputeRuntime(t.properties as ModelProperties));
      return { ...result, items, total: items.length };
    },
    enabled,
  });

  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: runtimeQueryKey });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${TECHNOLOGY_LAYER_COLOR}20`, color: TECHNOLOGY_LAYER_COLOR }}
          >
            Technology Layer
          </span>
          <h1 className="text-lg font-semibold text-gray-900">Runtimes</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New runtime
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-3">No runtimes yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-slate-600 hover:underline text-sm">
              Create the first runtime →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <RuntimeCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRuntimePanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <RuntimeDetail
          runtime={selected}
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
