"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import type { IntegrationFlowProperties, MinEAObject, ObjectListResponse, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import {
  architectureRelationshipsFromFlow,
  mergeArchitectureRelationships,
  persistFlowArchitecture,
} from "@/lib/flow-relationship-utils";
import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import { refreshObjectRelationshipQueries } from "@/lib/relationship-query-utils";
import { useTenancy } from "@/lib/tenancy";
import { OwnershipDetailRow } from "@/components/ownership/OwnershipDetailRow";
import {
  DetailPanel,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { DetailObjectActions } from "@/components/ui/DetailObjectActions";
import { usePermissions } from "@/lib/use-permissions";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { FlowDiagramModal, type NodeLayout } from "@/components/integration/FlowDiagram";
import { FlowRelationshipsTab } from "@/components/integration/FlowRelationshipsTab";
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
  const { canEdit, canDelete } = usePermissions();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(flow.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveFlow, setLiveFlow] = useState(flow);
  const [relationshipsSnapshot, setRelationshipsSnapshot] = useState<Relationship[] | null>(null);
  const liveFlowRef = useRef(flow);

  useEffect(() => {
    setLiveFlow(flow);
    liveFlowRef.current = flow;
  }, [flow.id, flow.updated_at]);

  useEffect(() => {
    setRelationshipsSnapshot(null);
  }, [flow.id]);

  const props = (liveFlow.properties ?? {}) as IntegrationFlowProperties;

  const flowsQueryKey = ["objects", orgSlug, workspaceSlug, "integration_flow"] as const;
  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, flow.id] as const;

  const [architectureUpdating, setArchitectureUpdating] = useState(false);

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", flow.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: flow.id }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", flow.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: flow.id }, token!);
    },
    staleTime: 0,
  });

  const diagramRefreshing =
    architectureUpdating || outRelsFetching || inRelsFetching;

  const drawerRels = useMemo(() => {
    const flowRels = relationshipsSnapshot ?? [...(outRels ?? []), ...(inRels ?? [])];
    return excludeTechDebtRelationships(mergeArchitectureRelationships(flowRels, liveFlow));
  }, [relationshipsSnapshot, outRels, inRels, liveFlow]);

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

  const syncRelationshipsFromServer = useCallback(
    async (options?: { manageSpinner?: boolean }) => {
      const token = await getToken();
      if (!token) return;
      const manageSpinner = options?.manageSpinner !== false;
      if (manageSpinner) setArchitectureUpdating(true);
      try {
        const { outbound, inbound } = await refreshObjectRelationshipQueries(
          queryClient,
          orgSlug,
          workspaceSlug,
          flow.id,
          token
        );
        setRelationshipsSnapshot(excludeTechDebtRelationships([...outbound, ...inbound]));
      } finally {
        if (manageSpinner) setArchitectureUpdating(false);
      }
    },
    [getToken, queryClient, orgSlug, workspaceSlug, flow.id]
  );

  const handleArchitectureChange = useCallback(
    async (updates: Parameters<typeof persistFlowArchitecture>[3]) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      setArchitectureUpdating(true);
      try {
        const updated = await persistFlowArchitecture(
          orgSlug,
          workspaceSlug,
          liveFlowRef.current,
          updates,
          token
        );
        setLiveFlow(updated);
        liveFlowRef.current = updated;
        setRelationshipsSnapshot(
          excludeTechDebtRelationships(architectureRelationshipsFromFlow(updated))
        );
        await syncRelationshipsFromServer({ manageSpinner: false });
        queryClient.setQueryData<ObjectListResponse>(flowsQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((o) => (o.id === updated.id ? updated : o)),
          };
        });
        refreshFlow();
        onUpdate();
        return updated;
      } finally {
        setArchitectureUpdating(false);
      }
    },
    [
      getToken,
      orgSlug,
      workspaceSlug,
      flow.id,
      queryClient,
      flowsQueryKey,
      onUpdate,
      syncRelationshipsFromServer,
    ]
  );

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

      const current = liveFlowRef.current;
      const currentProps = (current.properties ?? {}) as IntegrationFlowProperties;

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        flow.id,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...current,
        properties: { ...currentProps, node_layout: layout },
      };

      queryClient.setQueryData<ObjectListResponse>(flowsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === flow.id ? withLayout : o)),
        };
      });

      setLiveFlow(withLayout);
      liveFlowRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, flow.id, queryClient, flowsQueryKey]
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
                  <h2 className="font-semibold text-gray-900 truncate">{liveFlow.name}</h2>
                  <p className="text-sm text-gray-400">{formatFlowSubtitle(props.protocol)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {liveFlow.status && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      getStatusColor(liveFlow.status)
                    )}
                  >
                    {getStatusLabel(liveFlow.status)}
                  </span>
                )}
                <DetailObjectActions
                  onClose={onClose}
                  onEdit={() => setShowEditForm(true)}
                  onDelete={() => setShowDeleteConfirm(true)}
                  deletePending={deleteMutation.isPending}
                  editLabel="Edit flow"
                  deleteLabel="Delete flow"
                />
              </div>
            </div>

            <ObjectDrawerTabs
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                if (tab === "relationships") void syncRelationshipsFromServer();
              }}
              showRelationships
              relationshipCount={drawerRels.length}
              openDebtCount={techDebtSummary?.open_count ?? 0}
              className="mt-4"
            />
          </div>
        }
        footer={
          <div className="border-t border-gray-100 px-6 py-3">
            <p className="text-xs text-gray-400">
              Updated{liveFlow.updated_by_name ? ` by ${liveFlow.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(liveFlow.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "relationships" ? (
          <FlowRelationshipsTab
            flow={liveFlow}
            relationships={drawerRels}
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
          />
        ) : activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={liveFlow.id}
            objectName={liveFlow.name}
            objectKind="integration_flow"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={liveFlow.owner}
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
            {liveFlow.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700">{liveFlow.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Properties">
              <div className="space-y-2 text-sm">
                <OwnershipDetailRow entity={liveFlow} />
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
          </>
        )}
      </DetailPanel>

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete flow"
          message={`Are you sure you want to delete "${liveFlow.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <FlowDiagramModal
          flow={liveFlow}
          onClose={() => setShowChart(false)}
          onLayoutSave={canEdit ? handleLayoutSave : undefined}
          onResetLayout={canEdit ? handleResetLayout : undefined}
          onArchitectureChange={canEdit ? handleArchitectureChange : undefined}
        />
      )}

      {canEdit && showEditForm && (
        <ObjectForm
          objectType="integration_flow"
          initialValues={liveFlow}
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
