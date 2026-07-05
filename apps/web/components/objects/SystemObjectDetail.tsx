"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2 } from "lucide-react";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { getObjectInitial } from "@/lib/utils";
import {
  DetailPanel,
  DetailPanelCloseButton,
} from "@/components/ui/DetailPanel";
import { DeleteSystemConfirmDialog } from "@/components/application/DeleteSystemConfirmDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { SystemDrawerTabs, type SystemDrawerTabId } from "@/components/application/SystemDrawerTabs";
import { SystemDetailsTab } from "@/components/application/SystemDetailsTab";
import { SystemDataTab } from "@/components/application/SystemDataTab";
import { SystemObjectLinksTab } from "@/components/application/SystemObjectLinksTab";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { TechDebtHostKind } from "@minea/types";
import { CreateApiPanel } from "@/components/integration/CreateApiPanel";
import { CreateEventPanel } from "@/components/integration/CreateEventPanel";
import { CreateFlowPanel } from "@/components/integration/CreateFlowPanel";
import { FlowDetail } from "@/components/integration/FlowDetail";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { SystemDiagramModal, type NodeLayout } from "@/components/application/SystemDiagram";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import { systemFlowEndpoint, unlinkFlowFromSystem } from "@/lib/flow-system-utils";
import {
  systemApiProviderRef,
  systemEventProducerRef,
} from "@/lib/system-integration-link-utils";
import { invalidateSystemCaches } from "@/lib/system-capability-utils";
import { systemDataEntityLinks } from "@/lib/system-drawer-utils";
import { useSystemLinkedNames } from "@/lib/use-system-linked-names";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { usePermissions } from "@/lib/use-permissions";
import { type ApplicationProperties, type FlowEndpointRef, type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";

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
  const [activeTab, setActiveTab] = useState<SystemDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(objectId);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRelForm, setShowRelForm] = useState(false);
  const [relFormTargetType, setRelFormTargetType] = useState<string | undefined>();
  const [showChart, setShowChart] = useState(false);
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [createFlowName, setCreateFlowName] = useState("");
  const [createFlowPresetFrom, setCreateFlowPresetFrom] = useState<FlowEndpointRef | null>(null);
  const [showCreateApi, setShowCreateApi] = useState(false);
  const [createApiName, setCreateApiName] = useState("");
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [createEventName, setCreateEventName] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<MinEAObject | null>(null);
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

  const { data: flowsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "integration_flow"],
    enabled: !!object,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(
        orgSlug,
        workspaceSlug,
        { type: "integration_flow", page_size: 200 },
        token!
      );
    },
    staleTime: 0,
  });

  const allFlows = flowsData?.items ?? [];

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      void refetch();
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
  const displaySystem = liveSystem ?? object;
  const { nameById, isLoading: namesLoading } = useSystemLinkedNames(displaySystem, drawerRels);

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
    [getToken, orgSlug, workspaceSlug, objectId, queryClient, object]
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

  const openRelForm = (targetType?: string) => {
    setRelFormTargetType(targetType);
    setShowRelForm(true);
  };

  const closeRelForm = () => {
    setShowRelForm(false);
    setRelFormTargetType(undefined);
  };

  const linkedEntityIds = useMemo(
    () => systemDataEntityLinks(objectId, drawerRels).map((link) => link.objectId),
    [objectId, drawerRels]
  );

  const openCreateFlow = (name: string) => {
    if (displaySystem) {
      setCreateFlowPresetFrom(systemFlowEndpoint(displaySystem));
    }
    setCreateFlowName(name);
    setShowCreateFlow(true);
  };

  const closeCreateFlow = () => {
    setShowCreateFlow(false);
    setCreateFlowName("");
    setCreateFlowPresetFrom(null);
  };

  const handleFlowLinked = () => {
    queryClient.invalidateQueries({
      queryKey: ["objects", orgSlug, workspaceSlug, "integration_flow"],
    });
  };

  const handleIntegrationLinked = () => {
    queryClient.invalidateQueries({ queryKey: ["relationships"] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "api"] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "event"] });
  };

  const openCreateApi = (name: string) => {
    setCreateApiName(name);
    setShowCreateApi(true);
  };

  const closeCreateApi = () => {
    setShowCreateApi(false);
    setCreateApiName("");
  };

  const openCreateEvent = (name: string) => {
    setCreateEventName(name);
    setShowCreateEvent(true);
  };

  const closeCreateEvent = () => {
    setShowCreateEvent(false);
    setCreateEventName("");
  };

  const unlinkFlowMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const flow = allFlows.find((item) => item.id === flowId);
      if (!flow) throw new Error("Flow not found");
      return unlinkFlowFromSystem(orgSlug, workspaceSlug, flow, objectId, token);
    },
    onSuccess: () => {
      handleFlowLinked();
    },
    onError: (err) => {
      console.error("Failed to unlink flow:", err);
    },
  });

  const openFlowDetail = (flowId: string) => {
    const flow = allFlows.find((f) => f.id === flowId) ?? null;
    if (flow) setSelectedFlow(flow);
  };

  if (isLoading || !object) {
    return (
      <DetailPanel
        size="wide"
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

  const layerLabel = OBJECT_TYPE_LABELS[object.type] ?? object.type;

  return (
    <>
      <DetailPanel
        size="wide"
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
            <SystemDrawerTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              openDebtCount={techDebtSummary?.open_count ?? 0}
              className="mt-4"
            />
          </div>
        }
      >
        {activeTab === "details" && displaySystem && (
          <SystemDetailsTab
            object={displaySystem}
            layerLabel={layerLabel}
            linkedCapabilities={linkedCapabilities}
            productLinks={productLinks}
            productLinksLoading={productLinksLoading}
            relationships={drawerRels}
            nameById={nameById}
            flows={allFlows}
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
          />
        )}

        {activeTab === "data" && displaySystem && (
          <SystemDataTab
            system={displaySystem}
            relationships={drawerRels}
            allFlows={allFlows}
            nameById={nameById}
            namesLoading={namesLoading}
            canEdit={canEdit}
            onAddStore={() => openRelForm("data_store")}
            onAddDomain={() => openRelForm("data_domain")}
            onCreateFlow={openCreateFlow}
            onFlowLinked={handleFlowLinked}
            onUnlinkFlow={(flowId) => unlinkFlowMutation.mutate(flowId)}
            isUnlinkingFlow={unlinkFlowMutation.isPending}
            onOpenFlow={openFlowDetail}
            onRemove={(id) => deleteRelMutation.mutate(id)}
            isRemoving={deleteRelMutation.isPending}
            onRefresh={() => void refreshObject()}
          />
        )}

        {activeTab === "object_links" && displaySystem && (
          <SystemObjectLinksTab
            system={displaySystem}
            relationships={drawerRels}
            allFlows={allFlows}
            nameById={nameById}
            namesLoading={namesLoading}
            canEdit={canEdit}
            onAddSystem={() => openRelForm("application")}
            onAddComponent={() => openRelForm("component")}
            onAddPlatform={() => openRelForm("cloud_service")}
            onAddCapability={() => openRelForm("capability")}
            onCreateApi={openCreateApi}
            onCreateEvent={openCreateEvent}
            onIntegrationLinked={handleIntegrationLinked}
            onCreateFlow={openCreateFlow}
            onFlowLinked={handleFlowLinked}
            onUnlinkFlow={(flowId) => unlinkFlowMutation.mutate(flowId)}
            isUnlinkingFlow={unlinkFlowMutation.isPending}
            onOpenFlow={openFlowDetail}
            onRemove={(id) => deleteRelMutation.mutate(id)}
            isRemoving={deleteRelMutation.isPending}
          />
        )}

        {activeTab === "tech_debt" && (
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

        {activeTab === "history" && (
          <EntityHistoryPanel
            entries={historyData?.entries ?? []}
            isLoading={historyLoading}
          />
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
          initialTargetType={relFormTargetType}
          onClose={closeRelForm}
          onSuccess={() => {
            closeRelForm();
            queryClient.invalidateQueries({ queryKey: ["relationships"] });
            void refreshObject();
          }}
        />
      )}

      {showChart && displaySystem && (
        <SystemDiagramModal
          system={displaySystem}
          relationships={drawerRels}
          flows={allFlows}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
          onAddConnection={() => {
            setShowChart(false);
            setActiveTab("object_links");
            openRelForm();
          }}
        />
      )}

      {showCreateFlow && (
        <CreateFlowPanel
          initialFrom={createFlowPresetFrom}
          initialName={createFlowName}
          onClose={closeCreateFlow}
          onSuccess={() => {
            closeCreateFlow();
            handleFlowLinked();
          }}
        />
      )}

      {showCreateApi && displaySystem && (
        <CreateApiPanel
          initialName={createApiName}
          initialProvider={systemApiProviderRef(displaySystem)}
          onClose={closeCreateApi}
          onSuccess={() => {
            closeCreateApi();
            handleIntegrationLinked();
          }}
        />
      )}

      {showCreateEvent && displaySystem && (
        <CreateEventPanel
          initialName={createEventName}
          initialProducer={systemEventProducerRef(displaySystem)}
          onClose={closeCreateEvent}
          onSuccess={() => {
            closeCreateEvent();
            handleIntegrationLinked();
          }}
        />
      )}

      {selectedFlow && (
        <FlowDetail
          flow={selectedFlow}
          onClose={() => setSelectedFlow(null)}
          onDelete={() => {
            setSelectedFlow(null);
            queryClient.invalidateQueries({
              queryKey: ["objects", orgSlug, workspaceSlug, "integration_flow"],
            });
          }}
          onUpdate={() => {
            queryClient.invalidateQueries({
              queryKey: ["objects", orgSlug, workspaceSlug, "integration_flow"],
            });
          }}
        />
      )}
    </>
  );
}
