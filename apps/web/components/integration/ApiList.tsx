"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Braces, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateApiPanel } from "@/components/integration/CreateApiPanel";
import { ApiDetail } from "@/components/integration/ApiDetail";
import {
  API_STYLE_LABEL,
  formatProviderLabel,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/api-utils";
import type { ApiProperties, MinEAObject } from "@minea/types";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

const CRIT_COLOR: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

function ApiCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as ApiProperties;
  const styleLabel = API_STYLE_LABEL[props.protocol ?? ""] ?? props.protocol;
  const consumerCount = props.consumers?.length ?? 0;

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
          <Braces size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate leading-tight">{item.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {styleLabel && (
              <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                {styleLabel}
                {props.version ? ` ${props.version}` : ""}
              </span>
            )}
            {props.audience && (
              <span className="text-[10px] text-gray-500 capitalize">{props.audience}</span>
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
            {item.status && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize", getStatusColor(item.status))}>
                {getStatusLabel(item.status)}
              </span>
            )}
          </div>

          {props.provider && (
            <p className="text-[10px] text-gray-500 truncate mt-2">
              Provider: {formatProviderLabel(props.provider)}
            </p>
          )}

          {consumerCount > 0 && (
            <p className="text-[10px] text-gray-400 mt-1">
              {consumerCount} consumer{consumerCount !== 1 ? "s" : ""}
            </p>
          )}

          {props.base_url && (
            <p className="text-[10px] text-gray-400 truncate mt-1 font-mono">{props.base_url}</p>
          )}
        </div>
      </div>
    </button>
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
