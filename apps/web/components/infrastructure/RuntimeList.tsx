"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import { RuntimeDetail } from "@/components/infrastructure/RuntimeDetail";
import {
  isComputeRuntime,
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_LIFECYCLE_LABEL,
  runtimeKindLabel,
  runtimeProviderLabel,
  TECHNOLOGY_LAYER_COLOR,
} from "@/lib/runtime-utils";
import type { MinEAObject, ModelProperties } from "@minea/types";
import { cn } from "@/lib/utils";

const CRIT_COLOR: Record<string, string> = {
  tier1: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

function RuntimeCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as ModelProperties;
  const kindLabel = runtimeKindLabel(props);
  const providerLabel = runtimeProviderLabel(props.runtime_provider);
  const lifecycle = props.lifecycle ? PLATFORM_LIFECYCLE_LABEL[props.lifecycle] : undefined;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="text-left bg-white rounded-xl border border-gray-200 hover:border-slate-300 transition-colors w-full p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: TECHNOLOGY_LAYER_COLOR }}
        >
          <Cpu size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate leading-tight">{item.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {kindLabel && (
              <span className="text-[10px] bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded-full font-medium">
                {kindLabel}
              </span>
            )}
            {providerLabel && <span className="text-[10px] text-gray-500">{providerLabel}</span>}
            {props.criticality && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                  CRIT_COLOR[props.criticality] ?? "bg-gray-100 text-gray-600"
                )}
              >
                {PLATFORM_CRITICALITY_LABEL[props.criticality] ?? props.criticality}
              </span>
            )}
            {lifecycle && (
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                {lifecycle}
              </span>
            )}
          </div>

          {props.service_product && (
            <p className="text-[10px] text-gray-500 truncate mt-2">{props.service_product}</p>
          )}

          {props.region && (
            <p className="text-[10px] text-gray-400 truncate mt-1">{props.region}</p>
          )}

          {item.owner && (
            <p className="text-[10px] text-gray-400 truncate mt-1">Owner: {item.owner}</p>
          )}
        </div>
      </div>
    </button>
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
              <div key={i} className="h-36 bg-gray-100 rounded-lg animate-pulse" />
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
