"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Edit2, Trash2 } from "lucide-react";
import type { IntegrationFlowProperties, MinEAObject, ObjectListResponse } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { FlowDiagramModal, type NodeLayout } from "@/components/integration/FlowDiagram";
import { FlowDiagramPreview } from "@/components/integration/FlowDiagramPreview";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import {
  FLOW_AUTH,
  FLOW_CRITICALITY,
  FLOW_DIRECTIONS,
  FLOW_FORMATS,
  FLOW_FREQUENCIES,
  FLOW_PROTOCOLS,
  formatFlowSubtitle,
} from "@/lib/flow-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

const PROTOCOL_LABEL = Object.fromEntries(FLOW_PROTOCOLS.map((p) => [p.value, p.label]));
const FORMAT_LABEL = Object.fromEntries(FLOW_FORMATS.map((f) => [f.value, f.label]));
const FREQ_LABEL = Object.fromEntries(FLOW_FREQUENCIES.map((f) => [f.value, f.label]));
const AUTH_LABEL = Object.fromEntries(FLOW_AUTH.map((a) => [a.value, a.label]));
const DIRECTION_LABEL = Object.fromEntries(FLOW_DIRECTIONS.map((d) => [d.value, d.label]));
const CRITICALITY_LABEL = Object.fromEntries(FLOW_CRITICALITY.map((c) => [c.value, c.label]));

function labelFor(map: Record<string, string>, value?: string) {
  if (!value) return undefined;
  return map[value] ?? value.replace(/_/g, " ");
}

interface Props {
  flow: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function FlowDetail({ flow, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(flow.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const srcSystems = props.sources?.systems ?? [];
  const dstSystems = props.destinations?.systems ?? [];
  const srcCount = srcSystems.length + (props.sources?.entities?.length ?? 0);
  const dstCount = dstSystems.length + (props.destinations?.entities?.length ?? 0);

  const flowsQueryKey = ["objects", orgSlug, workspaceSlug, "integration_flow"] as const;
  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, flow.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, flow.id, token!);
    },
    enabled: activeTab === "history",
  });

  const historyEntries: HistoryEntry[] = (historyQuery.data?.entries ?? []).map((e) => ({
    id: e.id,
    actor_name: e.actor_name,
    action: e.action,
    detail: e.detail ?? null,
    created_at: e.created_at,
  }));

  const refreshFlow = () => {
    queryClient.invalidateQueries({ queryKey: flowsQueryKey });
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, flow.id, token!);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onDelete();
    },
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const cached = queryClient.getQueryData<ObjectListResponse>(flowsQueryKey);
      const current = cached?.items.find((o) => o.id === flow.id) ?? flow;
      const currentProps = (current.properties ?? {}) as IntegrationFlowProperties;

      await objectsApi.update(orgSlug, workspaceSlug, flow.id, {
        properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
      }, token);

      queryClient.setQueryData<ObjectListResponse>(flowsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) =>
            o.id === flow.id
              ? { ...o, properties: { ...currentProps, node_layout: layout } }
              : o
          ),
        };
      });
    },
    [getToken, orgSlug, workspaceSlug, flow, queryClient, flowsQueryKey]
  );

  const handleResetLayout = useCallback(() => {
    handleLayoutSave({});
  }, [handleLayoutSave]);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex flex-col border-b border-gray-100">
            <div className="flex items-start justify-between p-6 pb-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-700">
                  <ArrowLeftRight size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{flow.name}</h2>
                  <p className="text-sm text-gray-400">{formatFlowSubtitle(props.protocol)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {flow.status && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      getStatusColor(flow.status)
                    )}
                  >
                    {getStatusLabel(flow.status)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit flow"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete flow"
                >
                  <Trash2 size={14} />
                </button>
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>

            <ObjectDrawerTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              openDebtCount={techDebtSummary?.open_count ?? 0}
              className="mt-4"
            />
          </div>
        }
        footer={
          <div className="border-t border-gray-100 px-6 py-3">
            <p className="text-xs text-gray-400">
              Updated{flow.updated_by_name ? ` by ${flow.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(flow.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={flow.id}
            objectName={flow.name}
            objectKind="integration_flow"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={flow.owner}
            onRefresh={refreshFlow}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            {flow.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700">{flow.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Properties">
              <div className="space-y-2 text-sm">
                {flow.owner && <DetailRow label="Owner" value={flow.owner} />}
                {props.protocol && (
                  <DetailRow label="Protocol" value={labelFor(PROTOCOL_LABEL, props.protocol)} />
                )}
                {props.format && (
                  <DetailRow label="Format" value={labelFor(FORMAT_LABEL, props.format)} />
                )}
                {props.frequency && (
                  <DetailRow label="Frequency" value={labelFor(FREQ_LABEL, props.frequency)} />
                )}
                {props.auth && <DetailRow label="Auth" value={labelFor(AUTH_LABEL, props.auth)} />}
                {props.direction && (
                  <DetailRow label="Direction" value={labelFor(DIRECTION_LABEL, props.direction)} />
                )}
                {props.criticality && (
                  <DetailRow
                    label="Criticality"
                    value={labelFor(CRITICALITY_LABEL, props.criticality)}
                  />
                )}
                {props.data_classification && (
                  <DetailRow label="Classification" value={props.data_classification} />
                )}
              </div>
            </DetailSection>

            <DetailSection title="Architecture">
              <FlowDiagramPreview flow={flow} onExpand={() => setShowChart(true)} />
              <p className="text-xs text-gray-400 mt-2">
                {srcCount} source{srcCount !== 1 ? "s" : ""} · {dstCount} destination
                {dstCount !== 1 ? "s" : ""}
                {props.protocol && ` · ${labelFor(PROTOCOL_LABEL, props.protocol)}`}
              </p>
            </DetailSection>

            {(srcSystems.length > 0 || dstSystems.length > 0) && (
              <DetailSection title="Connections">
                <div className="space-y-3 text-sm">
                  {srcSystems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Sources
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {srcSystems.map((s) => (
                          <span
                            key={s.system_id}
                            className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full"
                          >
                            {s.system_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {dstSystems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Destinations
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {dstSystems.map((s) => (
                          <span
                            key={s.system_id}
                            className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full"
                          >
                            {s.system_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete flow"
          message={`Are you sure you want to delete "${flow.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <FlowDiagramModal
          flow={flow}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
        />
      )}

      {showEditForm && (
        <ObjectForm
          objectType="integration_flow"
          initialValues={flow}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshFlow();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
