"use client";

import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { aiApi } from "@/lib/api-client";
import { ViewShell } from "@/components/views/ViewShell";
import { getView } from "@/lib/views";
import { AlertTriangle, Lightbulb, RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiInsight } from "@minea/types";

const view = getView("insights");

const TYPE_CONFIG = {
  risk: { icon: AlertTriangle, label: "Risk" },
  gap: { icon: TrendingUp, label: "Gap" },
  recommendation: { icon: Lightbulb, label: "Recommendation" },
};

export default function AiInsightsView() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { orgSlug, workspaceSlug } = useTenancy();

  const { data: insights, isLoading } = useQuery({
    queryKey: ["insights", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return aiApi.listInsights(orgSlug, workspaceSlug, token!);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return aiApi.generateInsights(orgSlug, workspaceSlug, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights", orgSlug, workspaceSlug] });
    },
  });

  const grouped = (insights ?? []).reduce<Record<string, AiInsight[]>>(
    (acc, insight) => {
      acc[insight.type] = acc[insight.type] ?? [];
      acc[insight.type]!.push(insight);
      return acc;
    },
    {}
  );

  const isEmpty = !isLoading && (insights ?? []).length === 0;

  return (
    <ViewShell
      view={view}
      isEmpty={isEmpty}
      onEmptyAction={() => generateMutation.mutate()}
      headerAction={
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-md px-2.5 py-1.5 bg-white disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(generateMutation.isPending && "animate-spin")} />
          {generateMutation.isPending ? "Generating…" : "Generate insights"}
        </button>
      }
    >
      <div className="space-y-6">
        {Object.entries(TYPE_CONFIG).map(([type, config]) => {
          const items = grouped[type] ?? [];
          if (items.length === 0) return null;
          const Icon = config.icon;
          return (
            <div key={type} className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Icon size={14} className="text-indigo-500" />
                <h2 className="font-semibold text-gray-900 text-sm">{config.label}s</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map((insight) => (
                  <div key={insight.id} className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{insight.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ViewShell>
  );
}
