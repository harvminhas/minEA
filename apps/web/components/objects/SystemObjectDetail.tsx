"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2 } from "lucide-react";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { formatCurrency, getObjectInitial } from "@/lib/utils";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { DeleteSystemConfirmDialog } from "@/components/application/DeleteSystemConfirmDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { TechDebtHostKind } from "@minea/types";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { SystemDiagramModal, type NodeLayout } from "@/components/application/SystemDiagram";
import { LinkProductDialog } from "@/components/application/LinkProductDialog";
import { SystemRelationshipsTab } from "@/components/application/SystemRelationshipsTab";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import { invalidateProductQueries } from "@/lib/product-queries";
import { buildDetailPropertyRows } from "@/lib/object-property-display";
import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import { invalidateSystemCaches } from "@/lib/system-capability-utils";
import { systemStatusLabel, SYSTEM_STATUS_STYLE } from "@/lib/system-utils";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";
import { systemCategoryDisplay } from "@/lib/system-category";
import { type ApplicationProperties, type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";

interface Props {
  objectId: string;
  accentColor: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function SystemObjectDetail({ objectId, accentColor, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const { canEdit, canDelete } = usePermissions();
  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(objectId);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRelForm, setShowRelForm] = useState(false);
  const [showLinkProduct, setShowLinkProduct] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [liveSystem, setLiveSystem] = useState<MinEAObject | null>(null);
  const liveSystemRef = useRef<MinEAObject | null>(null);

  const { data: object, isLoading, refetch } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, objectId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, objectId, token!);
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["object-history", orgSlug, workspaceSlug, objectId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, objectId, token!);
    },
    enabled: activeTab === "history",
  });

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", objectId],
    enabled: !!object,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: objectId }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", objectId],
    enabled: !!object,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: objectId }, token!);
    },
    staleTime: 0,
  });

  const diagramRefreshing = outRelsFetching || inRelsFetching;

  const { data: productLinksData, isLoading: productLinksLoading } = useQuery({
    queryKey: ["object-products", orgSlug, workspaceSlug, objectId],
    enabled: !!object,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.productLinks(orgSlug, workspaceSlug, objectId, token!);
    },
    staleTime: 0,
  });

  const productLinks = productLinksData?.items ?? [];

  const invalidateProductLinkQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["object-products", orgSlug, workspaceSlug, objectId] });
    void invalidateProductQueries(queryClient, orgSlug, workspaceSlug);
  };

  const linkProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return objectsApi.linkProduct(orgSlug, workspaceSlug, objectId, productId, token);
    },
    onSuccess: () => {
      setShowLinkProduct(false);
      invalidateProductLinkQueries();
    },
  });

  const unlinkProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return objectsApi.unlinkProduct(orgSlug, workspaceSlug, objectId, productId, token);
    },
    onSuccess: invalidateProductLinkQueries,
  });

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return objectsApi.delete(orgSlug, workspaceSlug, objectId, token);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
      void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
      onUpdate();
      onClose();
    },
  });

  const refreshObject = async () => {
    await invalidateSystemCaches(queryClient, orgSlug, workspaceSlug, objectId);
    await refetch();
    void queryClient.invalidateQueries({
      queryKey: ["object-history", orgSlug, workspaceSlug, objectId],
    });
    onUpdate();
  };

  const allRels = [...(outRels ?? []), ...(inRels ?? [])];
  const drawerRels = excludeTechDebtRelationships(allRels);

  useEffect(() => {
    if (!object) return;
    setLiveSystem(object);
    liveSystemRef.current = object;
  }, [object]);

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const current = liveSystemRef.current ?? object;
      if (!current) return;
      const currentProps = (current.properties ?? {}) as ApplicationProperties;

      const updated = await objectsApi.update(
        orgSlug,
        workspaceSlug,
        objectId,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...updated,
        properties: { ...currentProps, node_layout: layout },
      };

      queryClient.setQueryData<MinEAObject>(["object", orgSlug, workspaceSlug, objectId], withLayout);
      setLiveSystem(withLayout);
      liveSystemRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, objectId, queryClient]
  );

  const handleResetLayout = useCallback(() => {
    handleLayoutSave({});
  }, [handleLayoutSave]);

  const supportedCapabilityIds = (inRels ?? [])
    .filter(
      (r) =>
        r.type === "supported_by" &&
        r.from_type === "capability" &&
        r.to_type === "application"
    )
    .map((r) => r.from_object_id);

  const { data: capabilitiesData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "capability", supportedCapabilityIds.join(",")],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!);
    },
    enabled: !!object && supportedCapabilityIds.length > 0,
  });

  const linkedCapabilities =
    capabilitiesData?.items.filter((c) => supportedCapabilityIds.includes(c.id)) ?? [];

  if (isLoading || !object) {
    return (
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="h-10 w-24 bg-gray-100 rounded animate-pulse" />
            <DetailPanelCloseButton onClose={onClose} />
          </div>
        }
      >
        <p className="text-sm text-gray-400">Loading…</p>
      </DetailPanel>
    );
  }

  const props = object.properties as Record<string, unknown>;
  const appProps = object.properties as ApplicationProperties;
  const platformName = appProps.platform?.platform_name;
  const status = object.status ?? "planned";
  const layerLabel = OBJECT_TYPE_LABELS[object.type] ?? object.type;

  const platformFromRel = (outRels ?? []).find(
    (r) => r.type === "runs_on" && r.from_type === "application" && r.to_type === "cloud_service"
  );
  const categoryMeta = systemCategoryDisplay(appProps);
  const detailPropertyRows = buildDetailPropertyRows(props, object.type);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="border-b border-gray-100">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  {getObjectInitial(object.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{object.name}</h2>
                  <p className="text-sm text-gray-400">
                    {layerLabel} · {object.owner ?? "Unassigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowEditForm(true)}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label="Edit system"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Delete system"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>
            <ObjectDrawerTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              showRelationships
              relationshipCount={drawerRels.length + productLinks.length}
              openDebtCount={techDebtSummary?.open_count ?? 0}
              className="mt-4"
            />
          </div>
        }
      >
        {activeTab === "history" && (
          <EntityHistoryPanel
            entries={historyData?.entries ?? []}
            isLoading={historyLoading}
          />
        )}

        {activeTab === "relationships" && object && (
          <SystemRelationshipsTab
            system={liveSystem ?? object}
            relationships={drawerRels}
            productLinks={productLinks}
            productLinksLoading={productLinksLoading}
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
            onAdd={canEdit ? () => setShowRelForm(true) : undefined}
            onLinkProduct={canEdit ? () => setShowLinkProduct(true) : undefined}
            onRemove={canEdit ? (id) => deleteRelMutation.mutate(id) : undefined}
            onUnlinkProduct={canEdit ? (id) => unlinkProductMutation.mutate(id) : undefined}
            isRemoving={deleteRelMutation.isPending}
            isUnlinkingProduct={unlinkProductMutation.isPending}
          />
        )}

        {activeTab === "tech_debt" && object && (
          <ObjectTechDebtTab
            objectId={object.id}
            objectName={object.name}
            objectKind={object.type as TechDebtHostKind}
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={object.owner}
            onRefresh={() => void refreshObject()}
          />
        )}

        {activeTab === "details" && (
          <>
            {object.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700 px-6 pb-4">{object.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Properties">
              <div className="px-6 pb-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Owner</span>
                  <span className="text-gray-900 font-medium">{object.owner ?? "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Status</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      SYSTEM_STATUS_STYLE[status] ?? SYSTEM_STATUS_STYLE.planned
                    )}
                  >
                    {systemStatusLabel(status)}
                  </span>
                </div>
                {(platformName || platformFromRel) && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Built on platform</span>
                    <span className="text-gray-900 font-medium">
                      {platformName || "Linked platform"}
                    </span>
                  </div>
                )}
                {categoryMeta.label && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Category</span>
                    <span className="text-gray-900 font-medium text-right">
                      {categoryMeta.label}
                      {categoryMeta.needsReview && (
                        <span className="block text-[11px] font-medium text-amber-700 mt-0.5">
                          Needs review — pick a functional domain when editing
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {categoryMeta.isCustomBuilt && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Custom-built</span>
                    <span className="text-gray-900 font-medium">Yes — built in-house</span>
                  </div>
                )}
                {props.vendor != null && props.vendor !== "" && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Vendor</span>
                    <span className="text-gray-900">{String(props.vendor)}</span>
                  </div>
                )}
                {props.annual_cost !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Annual cost</span>
                    <span className="text-gray-900">{formatCurrency(Number(props.annual_cost))}</span>
                  </div>
                )}
              </div>
            </DetailSection>

            <DetailSection title={`Capabilities (${linkedCapabilities.length})`}>
              <div className="px-6 pb-4">
                {linkedCapabilities.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No capabilities linked. Edit this system to select capabilities it supports.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {linkedCapabilities.map((cap) => (
                      <span
                        key={cap.id}
                        className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
                      >
                        {cap.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </DetailSection>

            {detailPropertyRows.length > 0 && (
              <DetailSection title={`${layerLabel} details`}>
                <div className="px-6 pb-4 space-y-2 text-sm">
                  {detailPropertyRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="text-gray-900 font-medium text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <DeleteSystemConfirmDialog
          system={object}
          relationships={allRels}
          accentColor={accentColor}
          isPending={deleteMutation.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}

      {showEditForm && (
        <ObjectForm
          objectType={object.type}
          initialValues={object}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            void refreshObject();
          }}
        />
      )}

      {showRelForm && (
        <RelationshipForm
          fromObject={object}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            queryClient.invalidateQueries({ queryKey: ["relationships"] });
            invalidateProductLinkQueries();
            refreshObject();
          }}
        />
      )}

      {showLinkProduct && (
        <LinkProductDialog
          linkedProductIds={productLinks.map((link) => link.id)}
          onClose={() => setShowLinkProduct(false)}
          onLink={(productId) => linkProductMutation.mutate(productId)}
          isLinking={linkProductMutation.isPending}
        />
      )}

      {showChart && object && (
        <SystemDiagramModal
          system={liveSystem ?? object}
          relationships={drawerRels}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
          onAddConnection={() => {
            setShowChart(false);
            setShowRelForm(true);
          }}
        />
      )}
    </>
  );
}
