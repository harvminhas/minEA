"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { objectsApi, aiApi } from "@/lib/api-client";
import { AlertTriangle, Shield, Bot, Wrench, Brain } from "lucide-react";
import { getStatusColor, getStatusLabel } from "@/lib/utils";
import type { MinEAObject } from "@minea/types";

export default function AiInfrastructurePage() {
  const { getToken } = useAuth();
  const { activeWorkspace } = useAppStore();

  const { data: agentsData } = useQuery({
    queryKey: ["objects", activeWorkspace?.id, "agent"],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list({ workspace_id: activeWorkspace!.id, type: "agent" }, token!);
    },
  });

  const { data: toolsData } = useQuery({
    queryKey: ["objects", activeWorkspace?.id, "tool"],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list({ workspace_id: activeWorkspace!.id, type: "tool" }, token!);
    },
  });

  const { data: modelsData } = useQuery({
    queryKey: ["objects", activeWorkspace?.id, "model"],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list({ workspace_id: activeWorkspace!.id, type: "model" }, token!);
    },
  });

  const { data: piiAgents } = useQuery({
    queryKey: ["pii-agents", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return aiApi.piiAgents(activeWorkspace!.id, token!);
    },
  });

  const { data: autonomousRisks } = useQuery({
    queryKey: ["autonomous-risks", activeWorkspace?.id],
    enabled: !!activeWorkspace,
    queryFn: async () => {
      const token = await getToken();
      return aiApi.autonomousRisks(activeWorkspace!.id, token!);
    },
  });

  const agents = agentsData?.items ?? [];
  const tools = toolsData?.items ?? [];
  const models = modelsData?.items ?? [];
  const piiAgentIds = new Set((piiAgents ?? []).map((a: MinEAObject) => a.id));
  const riskToolIds = new Set((autonomousRisks ?? []).map((t: MinEAObject) => t.id));

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-700">
            AI Infrastructure
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">AI Infrastructure</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cross-layer governance view — Agents, Tools, and Models in your architecture.
        </p>
      </div>

      {/* Governance alerts */}
      {((piiAgents ?? []).length > 0 || (autonomousRisks ?? []).length > 0) && (
        <div className="mb-8 space-y-3">
          {(piiAgents ?? []).length > 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {(piiAgents ?? []).length} agent{(piiAgents ?? []).length > 1 ? "s" : ""} with PII data access
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {(piiAgents ?? []).map((a: MinEAObject) => a.name).join(", ")} — review access controls.
                </p>
              </div>
            </div>
          )}
          {(autonomousRisks ?? []).length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <Shield size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {(autonomousRisks ?? []).length} irreversible tool{(autonomousRisks ?? []).length > 1 ? "s" : ""} used by autonomous agents
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {(autonomousRisks ?? []).map((t: MinEAObject) => t.name).join(", ")} — consider adding human approval gates.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agents */}
        <Section title="AI Agents" icon={Bot} color="#a855f7" count={agents.length}>
          {agents.map((agent) => (
            <ObjectRow
              key={agent.id}
              object={agent}
              warning={piiAgentIds.has(agent.id)}
              warningLabel="PII access"
            />
          ))}
        </Section>

        {/* Tools */}
        <Section title="Tools / MCP" icon={Wrench} color="#14b8a6" count={tools.length}>
          {tools.map((tool) => (
            <ObjectRow
              key={tool.id}
              object={tool}
              warning={riskToolIds.has(tool.id)}
              warningLabel="Irreversible"
            />
          ))}
        </Section>

        {/* Models */}
        <Section title="Models" icon={Brain} color="#6366f1" count={models.length}>
          {models.map((model) => (
            <ObjectRow key={model.id} object={model} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title, icon: Icon, color, count, children,
}: {
  title: string; icon: React.ElementType; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Icon size={14} style={{ color }} />
        <span className="font-semibold text-sm text-gray-900">{title}</span>
        <span className="ml-auto text-xs text-gray-400">{count}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {count === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-4 text-center">None modelled yet.</p>
        ) : children}
      </div>
    </div>
  );
}

function ObjectRow({ object, warning, warningLabel }: { object: MinEAObject; warning?: boolean; warningLabel?: string }) {
  const props = object.properties as Record<string, unknown>;
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{object.name}</p>
        {props.autonomy_level && (
          <p className="text-xs text-gray-400">{String(props.autonomy_level)}</p>
        )}
        {props.action_type && (
          <p className="text-xs text-gray-400">{String(props.action_type)}</p>
        )}
        {props.model_version && (
          <p className="text-xs text-gray-400">{String(props.model_version)}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {object.status && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(object.status)}`}>
            {getStatusLabel(object.status)}
          </span>
        )}
        {warning && warningLabel && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 flex items-center gap-1">
            <AlertTriangle size={9} /> {warningLabel}
          </span>
        )}
      </div>
    </div>
  );
}
