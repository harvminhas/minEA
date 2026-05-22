"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { aiApi } from "@/lib/api-client";
import { AlertTriangle, Lightbulb, TrendingUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_CONFIG = {
  risk: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50", label: "Risk" },
  gap: { icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-50", label: "Gap" },
  recommendation: { icon: Lightbulb, color: "text-blue-500", bg: "bg-blue-50", label: "Recommendation" },
};

const SEVERITY_COLOR = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

export default function InsightsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { activeWorkspace } = useAppStore();

  const { data: insights, isLoading } = useQuery({
    queryKey: ["insights", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return aiApi.listInsights(activeWorkspace!.id, token!);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return aiApi.generateInsights(activeWorkspace!.id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights", activeWorkspace?.id] });
    },
  });

  const grouped = (insights ?? []).reduce<Record<string, typeof insights>>((acc, insight) => {
    const type = insight!.type;
    if (!acc[type]) acc[type] = [];
    acc[type]!.push(insight!);
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-generated gaps, risks, and recommendations for your architecture.
          </p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={!activeWorkspace || generateMutation.isPending}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={cn(generateMutation.isPending && "animate-spin")} />
          {generateMutation.isPending ? "Generating..." : "Generate Insights"}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (insights ?? []).length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Lightbulb size={40} className="text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 text-sm mb-2">No insights yet.</p>
          <p className="text-xs text-gray-400">
            Click "Generate Insights" to run an AI analysis of your workspace.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, items]) => {
            const config = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.recommendation;
            const Icon = config.icon;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={15} className={config.color} />
                  <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
                    {config.label}s ({(items ?? []).length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {(items ?? []).map((insight) => (
                    <div key={insight!.id} className="bg-white rounded-lg border border-gray-200 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 text-sm">{insight!.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{insight!.description}</p>
                        </div>
                        {insight!.severity && (
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0",
                            SEVERITY_COLOR[insight!.severity as keyof typeof SEVERITY_COLOR] ?? SEVERITY_COLOR.low
                          )}>
                            {insight!.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-3">
                        {new Date(insight!.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
