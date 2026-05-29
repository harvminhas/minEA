"use client";

import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, aiApi } from "@/lib/api-client";
import { ViewShell } from "@/components/views/ViewShell";
import { getView } from "@/lib/views";
import { AlertTriangle, Bot, Brain, Wrench } from "lucide-react";
import { getStatusColor, getStatusLabel } from "@/lib/utils";
import type { MinEAObject, ModelProperties, ToolProperties } from "@minea/types";
import { isIntegrationInfra } from "@/lib/integration-infra-utils";
import { isAiModel } from "@/lib/runtime-utils";

const view = getView("ai-infrastructure");

function ObjectSection({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: typeof Bot;
  items: MinEAObject[];
  empty: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Icon size={14} className="text-indigo-500" />
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        <span className="ml-auto text-xs text-gray-400">{items.length}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {items.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-400">{empty}</p>
        ) : (
          items.map((obj) => (
            <div key={obj.id} className="px-6 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold">
                {obj.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{obj.name}</p>
                {obj.description && (
                  <p className="text-xs text-gray-400 truncate">{obj.description}</p>
                )}
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
  );
}

export default function AiInfrastructureView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const { data: agentsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "agent"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "agent" }, token!);
    },
  });

  const { data: toolsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "tool"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tool" }, token!);
    },
  });

  const { data: modelsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "model"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "model" }, token!);
    },
  });

  const { data: piiAgents } = useQuery({
    queryKey: ["pii-agents", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return aiApi.piiAgents(orgSlug, workspaceSlug, token!);
    },
  });

  const agents = agentsData?.items ?? [];
  const tools = (toolsData?.items ?? []).filter(
    (t) => !isIntegrationInfra(t.properties as ToolProperties)
  );
  const models = (modelsData?.items ?? []).filter((m) =>
    isAiModel(m.properties as ModelProperties)
  );
  const isEmpty = agents.length === 0 && tools.length === 0 && models.length === 0;

  return (
    <ViewShell view={view} isEmpty={isEmpty}>
      {(piiAgents?.length ?? 0) > 0 && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            {piiAgents!.length} agent{piiAgents!.length === 1 ? "" : "s"} may access PII data —
            review governance settings.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ObjectSection title="AI Agents" icon={Bot} items={agents} empty="No agents in repository." />
        <ObjectSection title="Tools / MCP" icon={Wrench} items={tools} empty="No tools in repository." />
        <ObjectSection title="Models" icon={Brain} items={models} empty="No models in repository." />
      </div>
    </ViewShell>
  );
}
