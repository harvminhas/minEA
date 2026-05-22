"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { objectsApi, aiApi } from "@/lib/api-client";
import { LAYER_CONFIG, OBJECT_TYPE_LABELS } from "@minea/types";
import { getStatusColor, getStatusLabel } from "@/lib/utils";
import { Sparkles, AlertTriangle, TrendingUp, Package } from "lucide-react";
import Link from "next/link";

const LAYER_ROUTES: Record<string, string> = {
  capability: "/app/business/capabilities",
  application: "/app/application/applications",
  data_object: "/app/data/data-objects",
  integration_flow: "/app/integration/flows",
};

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useAppStore();

  const { data: objectsData } = useQuery({
    queryKey: ["objects", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list({ workspace_id: activeWorkspace!.id }, token!);
    },
  });

  const { data: insights } = useQuery({
    queryKey: ["insights", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return aiApi.listInsights(activeWorkspace!.id, token!);
    },
  });

  const objects = objectsData?.items ?? [];
  const total = objectsData?.total ?? 0;

  // Count per type
  const countByType = objects.reduce<Record<string, number>>((acc, o) => {
    acc[o.type] = (acc[o.type] ?? 0) + 1;
    return acc;
  }, {});

  const recentObjects = [...objects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8);

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-8">
        {activeWorkspace?.name ?? "No workspace selected"} · {total} objects modelled
      </p>

      {/* Layer summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {Object.entries(LAYER_CONFIG).map(([layer, config]) => {
          const layerCount = config.types.reduce((sum, t) => sum + (countByType[t] ?? 0), 0);
          return (
            <div key={layer} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--tw-layer-${layer}, #64748b)` }} />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{config.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{layerCount}</p>
              <p className="text-xs text-gray-400">{config.types.length} types</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Recent Objects</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentObjects.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No objects yet. Use the AI ingestion or add objects manually.
              </div>
            ) : (
              recentObjects.map((obj) => (
                <div key={obj.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {obj.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{obj.name}</p>
                    <p className="text-xs text-gray-400">{OBJECT_TYPE_LABELS[obj.type as keyof typeof OBJECT_TYPE_LABELS] ?? obj.type}</p>
                  </div>
                  {obj.status && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(obj.status)}`}>
                      {getStatusLabel(obj.status)}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI Insights panel */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Sparkles size={14} className="text-purple-500" />
            <h2 className="font-semibold text-gray-900 text-sm">AI Insights</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(insights ?? []).length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No insights yet.{" "}
                <Link href="/app/insights" className="text-indigo-500 hover:underline">
                  Generate insights →
                </Link>
              </div>
            ) : (
              (insights ?? []).slice(0, 5).map((insight) => (
                <div key={insight.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={13}
                      className={insight.severity === "high" ? "text-red-500" : insight.severity === "medium" ? "text-amber-500" : "text-gray-400"}
                    />
                    <div>
                      <p className="text-xs font-medium text-gray-900">{insight.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{insight.description}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {(insights ?? []).length > 0 && (
            <div className="px-6 py-3 border-t border-gray-100">
              <Link href="/app/insights" className="text-xs text-indigo-500 hover:underline">
                View all insights →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
