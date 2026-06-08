"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { usePermissions } from "@/lib/use-permissions";
import { CreateRoadmapPanel } from "@/components/strategy/CreateRoadmapPanel";
import { RoadmapCard } from "@/components/views/RoadmapCard";
import {
  roadmapCardFromObject,
  roadmapDetailPath,
  STRATEGY_LAYER_COLOR,
} from "@/lib/roadmap-utils";

export function RoadmapList() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
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
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading roadmaps…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-3">No roadmap items yet.</p>
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-indigo-600 hover:underline text-sm"
              >
                Add your first roadmap item →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
            {items.map((item) => (
              <RoadmapCard
                key={item.id}
                model={roadmapCardFromObject(item)}
                onClick={() =>
                  router.push(roadmapDetailPath(orgSlug, workspaceSlug, item.id))
                }
              />
            ))}
          </div>
        )}
      </div>

      {canCreate && showCreate && (
        <CreateRoadmapPanel
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
