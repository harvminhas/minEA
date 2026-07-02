"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { dataApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AssignDataLinkDialog } from "@/components/data/AssignDataLinkDialog";
import { DataFormFooter, DataSelect } from "@/components/data/DataDetailShell";
import { type AssignTarget } from "@/components/data/DataLinksPanel";
import {
  DataRepositoryRelationshipsTab,
  DATA_STORE_ACCENT,
} from "@/components/data/DataObjectRelationshipsTab";
import { OperationalLinkList } from "@/components/data/OperationalLinkList";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import { SystemDiagramModal, type NodeLayout } from "@/components/application/SystemDiagram";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import {
  ROLE_TAG_STYLE,
  storeEntityAssignSection,
  storeEntityLinks,
  storeHostAssignSection,
  storeHostLinks,
  storeIntegrationAssignSection,
  storeIntegrationLinks,
} from "@/lib/data-utils";
import { cn } from "@/lib/utils";
import { DataDomainSelect, DomainAssignmentLabel } from "@/components/data/DataDomainSelect";
import {
  normalizeDomainFormValue,
  UNASSIGNED_DOMAIN_LABEL,
} from "@/lib/data-domain-assignment";
import { useDataDomainOptions } from "@/lib/use-data-domains";
import { usePermissions } from "@/lib/use-permissions";
import type { MinEAObject } from "@minea/types";

interface Props {
  storeId: string;
  onClose: () => void;
  onUpdate: () => void;
}

function assignDialogProps(
  assignTarget: AssignTarget,
  links: Array<{ link_kind: string; entity_kind: string; entity_id: string; role_tag?: string | null }>
) {
  const matchingLinks = links.filter(
    (link) =>
      link.link_kind === assignTarget.linkKind && link.entity_kind === assignTarget.entityKind
  );

  return {
    existingEntityIds: matchingLinks.map((link) => link.entity_id),
    assignedRoleByEntityId: Object.fromEntries(
      matchingLinks.map((link) => [link.entity_id, link.role_tag ?? undefined])
    ),
  };
}

export function StoreDetailPanel({ storeId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const enabled = useAuthQueryEnabled(storeId);

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const [storeType, setStoreType] = useState("relational_db");
  const [technology, setTechnology] = useState("");
  const [health, setHealth] = useState("healthy");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [showRelForm, setShowRelForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [liveObject, setLiveObject] = useState<MinEAObject | null>(null);
  const liveObjectRef = useRef<MinEAObject | null>(null);
  const { options: domainOptions, isLoading: domainsLoading } = useDataDomainOptions();
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(storeId);

  const { data: store, isLoading } = useQuery({
    queryKey: ["data-store", orgSlug, workspaceSlug, storeId],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getStore(orgSlug, workspaceSlug, storeId, token!);
    },
    enabled,
  });

  const { data: centerObject, isLoading: objectLoading } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, storeId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, storeId, token!);
    },
    enabled,
  });

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", storeId],
    enabled: !!centerObject,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: storeId }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", storeId],
    enabled: !!centerObject,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: storeId }, token!);
    },
    staleTime: 0,
  });

  const diagramRefreshing = outRelsFetching || inRelsFetching;
  const drawerRels = excludeTechDebtRelationships([...(outRels ?? []), ...(inRels ?? [])]);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["object-history", orgSlug, workspaceSlug, storeId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, storeId, token!);
    },
    enabled: activeTab === "history",
  });

  useEffect(() => {
    if (!centerObject) return;
    setLiveObject(centerObject);
    liveObjectRef.current = centerObject;
  }, [centerObject]);

  useEffect(() => {
    if (!store) return;
    setStoreType(store.store_type ?? "relational_db");
    setTechnology(store.technology ?? "");
    setHealth(store.health ?? "healthy");
    setDescription(store.description ?? "");
    setDomainId(normalizeDomainFormValue(store.data_domain_id, store.data_domain_name));
  }, [store]);

  const refreshStore = () => {
    queryClient.invalidateQueries({ queryKey: ["data-store", orgSlug, workspaceSlug, storeId] });
    queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, storeId] });
    queryClient.invalidateQueries({ queryKey: ["relationships"] });
    onUpdate();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return dataApi.updateStore(orgSlug, workspaceSlug, storeId, {
        store_type: storeType,
        technology: technology || null,
        health,
        description: description || null,
        data_domain_id: domainId || null,
      }, token!);
    },
    onSuccess: () => {
      refreshStore();
      onClose();
    },
  });

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      refreshStore();
    },
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const current = liveObjectRef.current ?? centerObject;
      if (!current) return;
      const currentProps = (current.properties ?? {}) as Record<string, unknown>;

      const updated = await objectsApi.update(
        orgSlug,
        workspaceSlug,
        storeId,
        {
          properties: { ...currentProps, node_layout: layout },
        },
        token
      );

      setLiveObject(updated);
      liveObjectRef.current = updated;
      queryClient.setQueryData(["object", orgSlug, workspaceSlug, storeId], updated);
    },
    [getToken, orgSlug, workspaceSlug, storeId, queryClient, centerObject]
  );

  const handleResetLayout = useCallback(() => {
    void handleLayoutSave({});
  }, [handleLayoutSave]);

  const addLink = async (target: AssignTarget, selectedId: string, roleTag?: string) => {
    const token = await getToken();
    await dataApi.addStoreLink(orgSlug, workspaceSlug, storeId, {
      entity_kind: target.entityKind,
      entity_id: selectedId,
      link_kind: target.linkKind,
      role_tag: roleTag,
    }, token!);
    setAssignTarget(null);
    refreshStore();
  };

  const relationshipCount = drawerRels.length;

  if (isLoading || objectLoading || !store || !centerObject) {
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

  const selectedDomainName = domainId
    ? domainOptions.find((option) => option.value === domainId)?.label ??
      store.data_domain_name ??
      UNASSIGNED_DOMAIN_LABEL
    : UNASSIGNED_DOMAIN_LABEL;
  const entityLinks = storeEntityLinks(store.links);
  const entityAssignSection = storeEntityAssignSection(store.links);
  const hostLinks = storeHostLinks(store.links);
  const hostAssignSection = storeHostAssignSection(store.links);
  const integrationLinks = storeIntegrationLinks(store.links);
  const integrationAssignSection = storeIntegrationAssignSection(store.links);
  const healthStyle = ROLE_TAG_STYLE[health] ?? ROLE_TAG_STYLE.healthy;

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="border-b border-gray-100">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 bg-emerald-600">
                  <Database size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{store.name}</h2>
                  <p className="text-sm text-gray-400 truncate">
                    Data store · <DomainAssignmentLabel name={selectedDomainName} />
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize", healthStyle)}>
                  {health.replace(/_/g, " ")}
                </span>
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>
            <ObjectDrawerTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              showRelationships
              relationshipCount={relationshipCount}
              openDebtCount={techDebtSummary?.open_count ?? 0}
              className="mt-2"
            />
          </div>
        }
        footer={
          activeTab === "details" ? (
            <DataFormFooter
              onSave={() => saveMutation.mutate()}
              saving={saveMutation.isPending}
              disabled={!canEdit}
              label="Save and close"
            />
          ) : (
            <div className="border-t border-gray-100 px-6 py-3">
              <p className="text-xs text-gray-400">
                Updated {new Date(store.updated_at).toLocaleDateString()}
              </p>
            </div>
          )
        }
      >
        {activeTab === "details" && (
          <>
            <DetailSection
              title="Data domain"
              hint="Optional governance metadata. Many stores can share one domain when assigned."
            >
              <DataDomainSelect
                value={domainId}
                onChange={setDomainId}
                options={domainOptions}
                loading={domainsLoading}
                disabled={!canEdit}
              />
            </DetailSection>

            <DetailSection title="Store type">
              <DataSelect
                value={storeType}
                onChange={setStoreType}
                options={[
                  { value: "relational_db", label: "Relational DB" },
                  { value: "document_db", label: "Document DB" },
                  { value: "data_warehouse", label: "Data Warehouse" },
                  { value: "data_lake", label: "Data Lake" },
                  { value: "file_store", label: "File Store" },
                  { value: "cache", label: "Cache" },
                ]}
              />
            </DetailSection>

            <DetailSection title="Technology">
              <input
                value={technology}
                onChange={(e) => setTechnology(e.target.value)}
                placeholder="PostgreSQL 15 · AWS RDS"
                disabled={!canEdit}
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50"
              />
            </DetailSection>

            <DetailSection title="Health">
              <DataSelect
                value={health}
                onChange={setHealth}
                options={[
                  { value: "healthy", label: "Healthy" },
                  { value: "at_risk", label: "At risk" },
                  { value: "degraded", label: "Degraded" },
                ]}
              />
            </DetailSection>

            <DetailSection title="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={!canEdit}
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50"
              />
            </DetailSection>

            <DetailSection
              title="Data entities"
              hint={entityAssignSection.footnote}
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAssignTarget(entityAssignSection)}
                    className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    + Add
                  </button>
                ) : undefined
              }
            >
              <OperationalLinkList
                links={entityLinks}
                basePath={basePath}
                emptyLabel="No entities assigned"
              />
            </DetailSection>

            <DetailSection
              title="Hosting system"
              hint={hostAssignSection.footnote}
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAssignTarget(hostAssignSection)}
                    className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    Change
                  </button>
                ) : undefined
              }
            >
              <OperationalLinkList
                links={hostLinks}
                basePath={basePath}
                emptyLabel="No hosting system assigned"
              />
            </DetailSection>

            <DetailSection
              title="Integrations"
              hint={integrationAssignSection.footnote}
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAssignTarget(integrationAssignSection)}
                    className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    + Assign
                  </button>
                ) : undefined
              }
            >
              <OperationalLinkList
                links={integrationLinks}
                basePath={basePath}
                emptyLabel="No integrations linked"
              />
            </DetailSection>
          </>
        )}

        {activeTab === "relationships" && (
          <DataRepositoryRelationshipsTab
            centerObject={liveObject ?? centerObject}
            relationships={drawerRels}
            objectType="data_store"
            accentColor={DATA_STORE_ACCENT}
            chipClassName="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full"
            detailsTabHint="Domain, entities, hosting system, and integrations are edited on the Details tab. Use Add or expand the map for other repository relationships."
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
            onAddRepositoryRel={canEdit ? () => setShowRelForm(true) : undefined}
            onRemoveRepositoryRel={canEdit ? (id) => deleteRelMutation.mutate(id) : undefined}
            isRemovingRepositoryRel={deleteRelMutation.isPending}
          />
        )}

        {activeTab === "tech_debt" && (
          <ObjectTechDebtTab
            objectId={storeId}
            objectName={store.name}
            objectKind="data_store"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            onRefresh={refreshStore}
          />
        )}

        {activeTab === "history" && (
          <EntityHistoryPanel
            entries={historyData?.entries ?? []}
            isLoading={historyLoading}
          />
        )}
      </DetailPanel>

      {assignTarget && (
        <AssignDataLinkDialog
          section={assignTarget}
          {...assignDialogProps(assignTarget, store.links)}
          onClose={() => setAssignTarget(null)}
          onAssign={(id, roleTag) => addLink(assignTarget, id, roleTag)}
        />
      )}

      {showRelForm && (
        <RelationshipForm
          fromObject={liveObject ?? centerObject}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            refreshStore();
          }}
        />
      )}

      {showChart && (
        <SystemDiagramModal
          system={liveObject ?? centerObject}
          relationships={drawerRels}
          accentColor={DATA_STORE_ACCENT}
          heading="Data store relationships"
          footerHint="Drag nodes to rearrange — positions save automatically. Use Add connection to link systems, domains, entities, and other architecture objects."
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
