"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import type { MinEAObject, ObjectListResponse, ToolProperties } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { excludeTechDebtRelationships, otherRelationshipObjectId } from "@/lib/relationship-display";
import {
  infraDiagramNameById,
  mergeInfraArchitectureRelationships,
} from "@/lib/integration-infra-relationship-utils";
import {
  DetailPanel,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { DetailObjectActions } from "@/components/ui/DetailObjectActions";
import { usePermissions } from "@/lib/use-permissions";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import { CreateIntegrationInfraPanel } from "@/components/integration/CreateIntegrationInfraPanel";
import {
  IntegrationInfraDiagramModal,
  type NodeLayout,
} from "@/components/integration/IntegrationInfraDiagram";
import { IntegrationInfraRelationshipsTab } from "@/components/integration/IntegrationInfraRelationshipsTab";
import {
  formatInfraHandles,
  formatInfraSubtitle,
  infraKindLabel,
  infraVendorLabel,
  INFRA_HANDLES,
  INFRA_HOSTING_LABEL,
  INFRA_ICON_STYLE,
  INFRA_LICENSE_LABEL,
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_SLA_LABEL,
  resolvedInfraHandles,
} from "@/lib/integration-infra-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

interface Props {
  infra: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function IntegrationInfraDetail({ infra, onClose, onDelete, onUpdate }: Props) {
  const { canEdit, canDelete } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(infra.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveInfra, setLiveInfra] = useState(infra);
  const liveInfraRef = useRef(infra);

  useEffect(() => {
    setLiveInfra(infra);
    liveInfraRef.current = infra;
  }, [infra.id, infra.updated_at]);

  const infraQueryKey = ["objects", orgSlug, workspaceSlug, "integration_infra"] as const;

  const props = (liveInfra.properties ?? {}) as ToolProperties;
  const kindLabel = infraKindLabel(props);
  const vendorLabel = infraVendorLabel(props.vendor);

  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, infra.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, infra.id, token!);
    },
    enabled: activeTab === "history",
  });

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", infra.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: infra.id }, token!);
    },
    enabled,
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", infra.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: infra.id }, token!);
    },
    enabled,
    staleTime: 0,
  });

  const diagramRefreshing = outRelsFetching || inRelsFetching;

  const { data: linkedApis } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "api", "infra-refs"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "api", page: 1 }, token!);
    },
    enabled,
    staleTime: 0,
  });

  const { data: linkedEvents } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "event", "infra-refs"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "event", page: 1 }, token!);
    },
    enabled,
    staleTime: 0,
  });

  const { data: linkedFlows } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "integration_flow", "infra-refs"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow", page: 1 }, token!);
    },
    enabled,
    staleTime: 0,
  });

  const drawerRels = useMemo(
    () =>
      excludeTechDebtRelationships(
        mergeInfraArchitectureRelationships(
          [...(outRels ?? []), ...(inRels ?? [])],
          liveInfra,
          linkedApis?.items ?? [],
          linkedEvents?.items ?? [],
          linkedFlows?.items ?? []
        )
      ),
    [outRels, inRels, liveInfra, linkedApis, linkedEvents, linkedFlows]
  );

  const baseNameById = useMemo(
    () =>
      infraDiagramNameById(
        liveInfra,
        linkedApis?.items ?? [],
        linkedEvents?.items ?? [],
        linkedFlows?.items ?? []
      ),
    [liveInfra, linkedApis, linkedEvents, linkedFlows]
  );

  const unresolvedRelatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of drawerRels) {
      ids.add(otherRelationshipObjectId(rel, infra.id));
    }
    return [...ids].filter((id) => !baseNameById[id]);
  }, [drawerRels, infra.id, baseNameById]);

  const relatedNameQueries = useQueries({
    queries: unresolvedRelatedIds.map((id) => ({
      queryKey: ["object", orgSlug, workspaceSlug, id],
      queryFn: async () => {
        const token = await getToken();
        return objectsApi.get(orgSlug, workspaceSlug, id, token!);
      },
    })),
  });

  const relationshipNameById = useMemo(() => {
    const names = { ...baseNameById };
    for (const query of relatedNameQueries) {
      if (query.data) names[query.data.id] = query.data.name;
    }
    return names;
  }, [baseNameById, relatedNameQueries]);

  const historyEntries: HistoryEntry[] = (historyQuery.data?.entries ?? []).map((e) => ({
    id: e.id,
    actor_name: e.actor_name,
    action: e.action,
    detail: e.detail ?? null,
    created_at: e.created_at,
  }));

  const refreshInfra = () => {
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
    queryClient.invalidateQueries({ queryKey: ["relationships", "from", infra.id] });
    queryClient.invalidateQueries({ queryKey: ["relationships", "to", infra.id] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "api", "infra-refs"] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "event", "infra-refs"] });
    queryClient.invalidateQueries({
      queryKey: ["objects", orgSlug, workspaceSlug, "integration_flow", "infra-refs"],
    });
    onUpdate();
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, infra.id, token!);
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

      const current = liveInfraRef.current;
      const currentProps = (current.properties ?? {}) as ToolProperties;

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        infra.id,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...current,
        properties: { ...currentProps, node_layout: layout },
      };

      queryClient.setQueryData<ObjectListResponse>(infraQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === infra.id ? withLayout : o)),
        };
      });

      setLiveInfra(withLayout);
      liveInfraRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, infra.id, queryClient, infraQueryKey]
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
                <div
                  className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    INFRA_ICON_STYLE
                  )}
                >
                  <ArrowLeftRight size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{infra.name}</h2>
                  <p className="text-sm text-gray-400">{formatInfraSubtitle(props)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <DetailObjectActions
                  onClose={onClose}
                  onEdit={() => setShowEditForm(true)}
                  onDelete={() => setShowDeleteConfirm(true)}
                  deletePending={deleteMutation.isPending}
                  editLabel="Edit infrastructure"
                  deleteLabel="Delete infrastructure"
                />
              </div>
            </div>

            <ObjectDrawerTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
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
              Updated{infra.updated_by_name ? ` by ${infra.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(infra.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "relationships" ? (
          <IntegrationInfraRelationshipsTab
            infra={liveInfra}
            relationships={drawerRels}
            nameById={relationshipNameById}
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
          />
        ) : activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={infra.id}
            objectName={infra.name}
            objectKind="tool"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={infra.owner}
            onRefresh={refreshInfra}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            <DetailSection title="Kind">
              {kindLabel && <DetailRow label="Type" value={kindLabel} />}
              {resolvedInfraHandles(props).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Handles
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {resolvedInfraHandles(props).map((handle) => {
                      const label = INFRA_HANDLES.find((h) => h.value === handle)?.label ?? handle;
                      return (
                        <span
                          key={handle}
                          className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {formatInfraHandles(resolvedInfraHandles(props))} can link to this carrier
                  </p>
                </div>
              )}
            </DetailSection>

            <DetailSection title="Identity">
              {vendorLabel && <DetailRow label="Vendor" value={vendorLabel} />}
              {props.vendor_product && <DetailRow label="Vendor product" value={props.vendor_product} />}
              {infra.description && <DetailRow label="Description" value={infra.description} />}
              {infra.tags.length > 0 && <DetailRow label="Tags" value={infra.tags.join(", ")} />}
            </DetailSection>

            <DetailSection title="Deployment">
              {props.hosting_model && (
                <DetailRow
                  label="Hosting model"
                  value={INFRA_HOSTING_LABEL[props.hosting_model] ?? props.hosting_model}
                />
              )}
              {props.region && <DetailRow label="Region" value={props.region} />}
              {props.environments && props.environments.length > 0 && (
                <DetailRow label="Environments" value={props.environments.join(", ")} />
              )}
              {props.admin_url && <DetailRow label="Admin URL" value={props.admin_url} />}
            </DetailSection>

            <DetailSection title="Contract">
              {props.license_model && (
                <DetailRow
                  label="License model"
                  value={INFRA_LICENSE_LABEL[props.license_model] ?? props.license_model}
                />
              )}
              {props.contract_renewal && <DetailRow label="Contract renewal" value={props.contract_renewal} />}
              {props.annual_cost && <DetailRow label="Annual cost" value={props.annual_cost} />}
            </DetailSection>

            <DetailSection title="Governance">
              {infra.owner && <DetailRow label="Owner" value={infra.owner} />}
              {props.sla_target && (
                <DetailRow label="SLA target" value={PLATFORM_SLA_LABEL[props.sla_target] ?? props.sla_target} />
              )}
              {props.lifecycle && (
                <DetailRow
                  label="Lifecycle"
                  value={PLATFORM_LIFECYCLE_LABEL[props.lifecycle] ?? props.lifecycle}
                />
              )}
              {props.criticality && (
                <DetailRow
                  label="Criticality"
                  value={PLATFORM_CRITICALITY_LABEL[props.criticality] ?? props.criticality}
                />
              )}
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete integration infrastructure"
          message={`Are you sure you want to delete "${infra.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <IntegrationInfraDiagramModal
          infra={liveInfra}
          relationships={drawerRels}
          nameById={relationshipNameById}
          onLayoutSave={canEdit ? handleLayoutSave : undefined}
          onResetLayout={canEdit ? handleResetLayout : undefined}
          onClose={() => setShowChart(false)}
        />
      )}

      {canEdit && showEditForm && (
        <CreateIntegrationInfraPanel
          initialValues={liveInfra}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshInfra();
          }}
        />
      )}
    </>
  );
}
