"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box } from "lucide-react";
import type { ComponentProperties, MinEAObject, ObjectListResponse, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import {
  architectureRelationshipsFromComponent,
  mergeArchitectureRelationships,
  persistComponentArchitecture,
} from "@/lib/component-relationship-utils";
import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import { refreshObjectRelationshipQueries } from "@/lib/relationship-query-utils";
import { useTenancy } from "@/lib/tenancy";
import { OwnershipDetailRow } from "@/components/ownership/OwnershipDetailRow";
import { DetailObjectActions } from "@/components/ui/DetailObjectActions";
import { usePermissions } from "@/lib/use-permissions";
import { CreateComponentPanel } from "@/components/application/CreateComponentPanel";
import {
  ComponentDiagramModal,
  sanitizeNodeLayout,
  type NodeLayout,
} from "@/components/application/ComponentDiagram";
import { ComponentRelationshipsTab } from "@/components/application/ComponentRelationshipsTab";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import {
  APPLICATION_LAYER_COLOR,
  COMPONENT_TYPE_LABEL,
} from "@/lib/component-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

interface Props {
  component: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function ComponentDetail({ component, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const { canEdit, canDelete } = usePermissions();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(component.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveComponent, setLiveComponent] = useState(component);
  const [relationshipsSnapshot, setRelationshipsSnapshot] = useState<Relationship[] | null>(null);
  const liveComponentRef = useRef(component);

  useEffect(() => {
    setLiveComponent(component);
    liveComponentRef.current = component;
  }, [component.id, component.updated_at]);

  useEffect(() => {
    setRelationshipsSnapshot(null);
  }, [component.id]);

  const props = (liveComponent.properties ?? {}) as ComponentProperties;
  const typeLabel = COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type;

  const componentsQueryKey = ["objects", orgSlug, workspaceSlug, "component"] as const;

  const [architectureUpdating, setArchitectureUpdating] = useState(false);

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", component.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: component.id }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", component.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: component.id }, token!);
    },
    staleTime: 0,
  });

  const diagramRefreshing =
    architectureUpdating || outRelsFetching || inRelsFetching;

  const drawerRels = useMemo(() => {
    const apiRels = relationshipsSnapshot ?? [...(outRels ?? []), ...(inRels ?? [])];
    return excludeTechDebtRelationships(mergeArchitectureRelationships(apiRels, liveComponent));
  }, [relationshipsSnapshot, outRels, inRels, liveComponent]);
  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, component.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, component.id, token!);
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

  const refreshComponent = () => {
    queryClient.invalidateQueries({ queryKey: componentsQueryKey });
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
          component.id,
          token
        );
        setRelationshipsSnapshot(excludeTechDebtRelationships([...outbound, ...inbound]));
      } finally {
        if (manageSpinner) setArchitectureUpdating(false);
      }
    },
    [getToken, queryClient, orgSlug, workspaceSlug, component.id]
  );

  const handleArchitectureChange = useCallback(
    async (updates: Parameters<typeof persistComponentArchitecture>[3]) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      setArchitectureUpdating(true);
      try {
        const updated = await persistComponentArchitecture(
          orgSlug,
          workspaceSlug,
          liveComponentRef.current,
          updates,
          token
        );
        setLiveComponent(updated);
        liveComponentRef.current = updated;
        setRelationshipsSnapshot(
          excludeTechDebtRelationships(architectureRelationshipsFromComponent(updated))
        );
        await syncRelationshipsFromServer({ manageSpinner: false });
        queryClient.setQueryData<ObjectListResponse>(componentsQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((o) => (o.id === updated.id ? updated : o)),
          };
        });
        refreshComponent();
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
      component.id,
      queryClient,
      componentsQueryKey,
      onUpdate,
      syncRelationshipsFromServer,
    ]
  );

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, component.id, token!);
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

      const current = liveComponentRef.current;
      const currentProps = (current.properties ?? {}) as ComponentProperties;

      const cleanLayout = sanitizeNodeLayout(layout) ?? {};

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        component.id,
        {
          properties: { ...currentProps, node_layout: cleanLayout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...current,
        properties: { ...currentProps, node_layout: cleanLayout },
      };

      queryClient.setQueryData<ObjectListResponse>(componentsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === component.id ? withLayout : o)),
        };
      });

      setLiveComponent(withLayout);
      liveComponentRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, component, queryClient, componentsQueryKey]
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
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                  style={{ backgroundColor: APPLICATION_LAYER_COLOR }}
                >
                  <Box size={16} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{component.name}</h2>
                  <p className="text-sm text-gray-400">{typeLabel ?? "Component"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {liveComponent.status && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      getStatusColor(liveComponent.status)
                    )}
                  >
                    {getStatusLabel(liveComponent.status)}
                  </span>
                )}
                <DetailObjectActions
                  onClose={onClose}
                  onEdit={() => setShowEditForm(true)}
                  onDelete={() => setShowDeleteConfirm(true)}
                  deletePending={deleteMutation.isPending}
                  editLabel="Edit component"
                  deleteLabel="Delete component"
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
              Updated{liveComponent.updated_by_name ? ` by ${liveComponent.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(liveComponent.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "relationships" ? (
          <ComponentRelationshipsTab
            component={liveComponent}
            relationships={drawerRels}
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
          />
        ) : activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={liveComponent.id}
            objectName={liveComponent.name}
            objectKind="component"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={liveComponent.owner}
            onRefresh={refreshComponent}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            <DetailSection title="Properties">
              <div className="space-y-2 text-sm">
                {typeLabel && <DetailRow label="Type" value={typeLabel} />}
                {props.tech_stack && <DetailRow label="Tech stack" value={props.tech_stack} />}
                <OwnershipDetailRow entity={liveComponent} />
                {props.runtime && (
                  <DetailRow label="Runs on" value={props.runtime.runtime_name} />
                )}
                {props.platform && (
                  <DetailRow label="Built on platform" value={props.platform.platform_name} />
                )}
                {liveComponent.tags.length > 0 && (
                  <DetailRow label="Tags" value={liveComponent.tags.join(", ")} />
                )}
              </div>
            </DetailSection>

          </>
        )}
      </DetailPanel>

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete component"
          message={`Are you sure you want to delete "${component.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <ComponentDiagramModal
          component={liveComponent}
          onClose={() => {
            setShowChart(false);
            void syncRelationshipsFromServer();
          }}
          onLayoutSave={canEdit ? handleLayoutSave : undefined}
          onResetLayout={canEdit ? handleResetLayout : undefined}
          onArchitectureChange={canEdit ? handleArchitectureChange : undefined}
        />
      )}

      {canEdit && showEditForm && (
        <CreateComponentPanel
          initialValues={component}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshComponent();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
