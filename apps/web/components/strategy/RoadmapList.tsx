"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Map, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateRoadmapPanel } from "@/components/strategy/CreateRoadmapPanel";
import {
  ROADMAP_STATUS_LABEL,
  roadmapDetailPath,
  roadmapKindLabel,
  STRATEGY_LAYER_COLOR,
  targetResolutionLabel,
} from "@/lib/roadmap-utils";
import type { MinEAObject, RoadmapItemProperties } from "@minea/types";

function RoadmapCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as RoadmapItemProperties;
  const kindLabel = roadmapKindLabel(props);
  const statusLabel = props.roadmap_status
    ? ROADMAP_STATUS_LABEL[props.roadmap_status]
    : undefined;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="text-left bg-white rounded-xl border border-gray-200 hover:border-violet-200 transition-colors w-full p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: STRATEGY_LAYER_COLOR }}
        >
          <Map size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate leading-tight">{item.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {kindLabel && (
              <span className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">
                {kindLabel}
              </span>
            )}
            {statusLabel && (
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                {statusLabel}
              </span>
            )}
          </div>

          {props.product && (
            <p className="text-[10px] text-gray-500 truncate mt-2">Product: {props.product.product_name}</p>
          )}

          {(props.resolves_debt?.length ?? 0) > 0 && (
            <p className="text-[10px] text-amber-700 mt-1">
              Resolves {props.resolves_debt!.length} debt item{props.resolves_debt!.length !== 1 ? "s" : ""}
            </p>
          )}

          {props.target_resolution && (
            <p className="text-[10px] text-gray-400 truncate mt-1">
              Target: {targetResolutionLabel(props.target_resolution)}
            </p>
          )}

          {item.owner && (
            <p className="text-[10px] text-gray-400 truncate mt-1">Owner: {item.owner}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function RoadmapList() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);

  const roadmapQueryKey = ["objects", orgSlug, workspaceSlug, "roadmap_item"] as const;

  const { data, isLoading } = useQuery({
    queryKey: roadmapQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "roadmap_item" }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: roadmapQueryKey });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${STRATEGY_LAYER_COLOR}20`, color: STRATEGY_LAYER_COLOR }}
          >
            Strategy Layer
          </span>
          <h1 className="text-lg font-semibold text-gray-900">Roadmaps</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New roadmap item
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
            <p className="text-gray-400 text-sm mb-3">No roadmap items yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-violet-600 hover:underline text-sm">
              Create the first item →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <RoadmapCard
                key={item.id}
                item={item}
                onOpenDetail={() =>
                  router.push(roadmapDetailPath(orgSlug, workspaceSlug, item.id))
                }
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateRoadmapPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            router.push(roadmapDetailPath(orgSlug, workspaceSlug, id));
          }}
        />
      )}
    </div>
  );
}
