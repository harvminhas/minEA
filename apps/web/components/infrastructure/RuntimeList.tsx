"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Cpu, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { usePermissions } from "@/lib/use-permissions";
import { CatalogCardFields } from "@/components/catalog/CatalogCardFields";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import { RuntimeDetail } from "@/components/infrastructure/RuntimeDetail";
import {
  catalogOwnerLabel,
  formatCatalogAnnualCost,
  formatCatalogContractEnd,
} from "@/lib/catalog-fields";
import {
  formatRuntimeSubtitle,
  isComputeRuntime,
  RUNTIME_ICON_STYLE,
  TECHNOLOGY_LAYER_COLOR,
} from "@/lib/runtime-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { MinEAObject, ModelProperties } from "@minea/types";
import { cn } from "@/lib/utils";

function RuntimeCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as ModelProperties;

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
      </div>

      <CatalogCardFields
        owner={catalogOwnerLabel(item)}
        vendor={props.vendor?.trim() || "—"}
        annualCost={formatCatalogAnnualCost(props.annual_cost)}
        contractEnd={formatCatalogContractEnd(props.commitment_ends)}
        lifecycle={props.lifecycle ?? item.status}
        criticality={props.criticality}
      />

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
  const { canCreate } = usePermissions();
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
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            New runtime
          </button>
        )}
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
            {canCreate && (
              <button onClick={() => setShowCreate(true)} className="text-slate-600 hover:underline text-sm">
                Create the first runtime →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <RuntimeCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {canCreate && showCreate && (
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
