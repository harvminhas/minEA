"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { dataApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AssignDataLinkDialog } from "@/components/data/AssignDataLinkDialog";
import { DataFormFooter, DataSelect } from "@/components/data/DataDetailShell";
import { type AssignTarget } from "@/components/data/DataLinksPanel";
import { OperationalLinkList } from "@/components/data/OperationalLinkList";
import {
  DataObjectRelationshipsTab,
  DATA_OBJECT_ACCENT,
} from "@/components/data/DataObjectRelationshipsTab";
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
  entityStoreAssignSection,
  entityStoreLinks,
  initials,
} from "@/lib/data-utils";
import { DataDomainSelect, DomainAssignmentLabel } from "@/components/data/DataDomainSelect";
import {
  normalizeDomainFormValue,
  UNASSIGNED_DOMAIN_LABEL,
} from "@/lib/data-domain-assignment";
import { useDataDomainOptions } from "@/lib/use-data-domains";
import { useApplicationOptions } from "@/lib/use-application-options";
import { usePermissions } from "@/lib/use-permissions";
import type { DataObjectProperties, MinEAObject } from "@minea/types";

interface Props {
  entityId: string;
  onClose: () => void;
  onUpdate: () => void;
}

function assignDialogProps(
  assignTarget: AssignTarget,
  entity: {
    links: Array<{ link_kind: string; entity_kind: string; entity_id: string; role_tag?: string | null }>;
    related_entities: Array<{ entity_id: string; role_tag?: string | null }>;
  }
) {
  const matchingLinks =
    assignTarget.linkKind === "related"
      ? entity.related_entities
      : entity.links.filter(
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

export function DataObjectDetail({ entityId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const enabled = useAuthQueryEnabled(entityId);

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const [classification, setClassification] = useState("core");
  const [sensitivity, setSensitivity] = useState("");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState("");
  const [ownerSystemId, setOwnerSystemId] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [showAddRelated, setShowAddRelated] = useState(false);
  const [showRelForm, setShowRelForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [liveObject, setLiveObject] = useState<MinEAObject | null>(null);
  const liveObjectRef = useRef<MinEAObject | null>(null);
  const { options: domainOptions, isLoading: domainsLoading } = useDataDomainOptions();
  const { options: applicationOptions, isLoading: applicationsLoading } = useApplicationOptions();
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(entityId);

  const { data: entity, isLoading } = useQuery({
    queryKey: ["data-entity", orgSlug, workspaceSlug, entityId],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getEntity(orgSlug, workspaceSlug, entityId, token!);
    },
    enabled,
  });

  const { data: centerObject, isLoading: objectLoading } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, entityId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, entityId, token!);
    },
    enabled,
  });

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", entityId],
    enabled: !!centerObject,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: entityId }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", entityId],
    enabled: !!centerObject,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: entityId }, token!);
    },
    staleTime: 0,
  });

  const diagramRefreshing = outRelsFetching || inRelsFetching;
  const drawerRels = excludeTechDebtRelationships([...(outRels ?? []), ...(inRels ?? [])]);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["object-history", orgSlug, workspaceSlug, entityId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, entityId, token!);
    },
    enabled: activeTab === "history",
  });

  useEffect(() => {
    if (!centerObject) return;
    setLiveObject(centerObject);
    liveObjectRef.current = centerObject;
  }, [centerObject]);

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      refreshEntity();
    },
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const current = liveObjectRef.current ?? centerObject;
      if (!current) return;
      const currentProps = (current.properties ?? {}) as DataObjectProperties;

      const updated = await objectsApi.update(
        orgSlug,
        workspaceSlug,
        entityId,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...updated,
        properties: { ...currentProps, node_layout: layout },
      };

      queryClient.setQueryData<MinEAObject>(["object", orgSlug, workspaceSlug, entityId], withLayout);
      setLiveObject(withLayout);
      liveObjectRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, entityId, queryClient, centerObject]
  );

  const handleResetLayout = useCallback(() => {
    void handleLayoutSave({});
  }, [handleLayoutSave]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return dataApi.updateEntity(orgSlug, workspaceSlug, entityId, {
        classification,
        sensitivity: sensitivity || null,
        description: description || null,
        data_domain_id: domainId || null,
        owner_system_id: ownerSystemId || null,
      }, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-entity", orgSlug, workspaceSlug, entityId] });
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "data_domain"] });
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "data_object"] });
      queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, entityId] });
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      queryClient.invalidateQueries({ queryKey: ["object-history", orgSlug, workspaceSlug, entityId] });
      onUpdate();
      onClose();
    },
  });

  useEffect(() => {
    if (!entity) return;
    setClassification(entity.classification ?? "core");
    setSensitivity(entity.sensitivity ?? "");
    setDescription(entity.description ?? "");
    setDomainId(normalizeDomainFormValue(entity.data_domain_id, entity.data_domain_name));
    setOwnerSystemId(entity.owner_system_id ?? "");
  }, [entity]);

  const refreshEntity = () => {
    queryClient.invalidateQueries({ queryKey: ["data-entity", orgSlug, workspaceSlug, entityId] });
    queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, entityId] });
    queryClient.invalidateQueries({ queryKey: ["relationships"] });
    onUpdate();
  };

  const addLink = async (target: AssignTarget, selectedId: string, roleTag?: string) => {
    const token = await getToken();
    await dataApi.addEntityLink(orgSlug, workspaceSlug, entityId, {
      entity_kind: target.entityKind,
      entity_id: selectedId,
      link_kind: target.linkKind,
      role_tag: roleTag,
    }, token!);
    refreshEntity();
  };

  const selectedDomainName = domainId
    ? domainOptions.find((option) => option.value === domainId)?.label ??
      entity?.data_domain_name ??
      UNASSIGNED_DOMAIN_LABEL
    : UNASSIGNED_DOMAIN_LABEL;

  const relationshipCount = drawerRels.length;

  if (isLoading || objectLoading || !entity || !centerObject) {
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

  const storeLinks = entityStoreLinks(entity.links);
  const storeAssignSection = entityStoreAssignSection(entity.links);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="border-b border-gray-100">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-violet-600">
                  {initials(entity.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{entity.name}</h2>
                  <p className="text-sm text-gray-400 truncate">
                    Data entity · <DomainAssignmentLabel name={selectedDomainName} />
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 capitalize">
                  {classification}
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
                Updated {new Date(entity.updated_at).toLocaleDateString()}
              </p>
            </div>
          )
        }
      >
        {activeTab === "details" && (
          <>
            <DetailSection
              title="Data domain"
              hint="Optional governance metadata. Many entities can share one domain when assigned."
            >
              <DataDomainSelect
                value={domainId}
                onChange={setDomainId}
                options={domainOptions}
                loading={domainsLoading}
                disabled={!canEdit}
              />
            </DetailSection>

            <DetailSection
              title="Owned by"
              hint="Only one system can own this entity. Many entities may share the same owner."
            >
              {applicationsLoading ? (
                <p className="text-sm text-gray-400">Loading systems…</p>
              ) : (
                <DataSelect
                  value={ownerSystemId}
                  onChange={setOwnerSystemId}
                  options={[
                    { value: "", label: "None" },
                    ...applicationOptions,
                  ]}
                />
              )}
            </DetailSection>

            <DetailSection
              title="Data stores"
              hint={storeAssignSection.footnote}
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAssignTarget(storeAssignSection)}
                    className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    + Assign
                  </button>
                ) : undefined
              }
            >
              <OperationalLinkList
                links={storeLinks}
                basePath={basePath}
                emptyLabel="No data stores assigned"
              />
            </DetailSection>

            <DetailSection title="Classification">
              <DataSelect
                value={classification}
                onChange={setClassification}
                options={[
                  { value: "core", label: "Core" },
                  { value: "reference", label: "Reference" },
                  { value: "master", label: "Master" },
                ]}
              />
            </DetailSection>

            <DetailSection title="Sensitivity">
              <DataSelect
                value={sensitivity || "none"}
                onChange={(v) => setSensitivity(v === "none" ? "" : v)}
                options={[
                  { value: "none", label: "None" },
                  { value: "pii", label: "PII" },
                  { value: "confidential", label: "Confidential" },
                  { value: "restricted", label: "Restricted" },
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
              title="Related entities"
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => setShowAddRelated(true)}
                    className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    + Add
                  </button>
                ) : undefined
              }
            >
              {entity.related_entities.length === 0 ? (
                <p className="text-sm text-gray-400">No related entities</p>
              ) : (
                <ul className="space-y-0">
                  {entity.related_entities.map((rel) => (
                    <li
                      key={rel.id}
                      className="flex items-center gap-2.5 py-2.5 border-b border-gray-100 last:border-b-0"
                    >
                      <span className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-violet-700 bg-violet-50">
                        {initials(rel.entity_name)}
                      </span>
                      <span className="text-sm text-gray-800 flex-1">{rel.entity_name}</span>
                      {rel.role_tag && (
                        <span className="text-xs text-gray-400">{rel.role_tag}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </>
        )}

        {activeTab === "relationships" && (
          <DataObjectRelationshipsTab
            centerObject={liveObject ?? centerObject}
            relationships={drawerRels}
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
            onAddRepositoryRel={canEdit ? () => setShowRelForm(true) : undefined}
            onRemoveRepositoryRel={canEdit ? (id) => deleteRelMutation.mutate(id) : undefined}
            isRemovingRepositoryRel={deleteRelMutation.isPending}
          />
        )}

        {activeTab === "tech_debt" && (
          <ObjectTechDebtTab
            objectId={entityId}
            objectName={entity.name}
            objectKind="data_object"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            onRefresh={refreshEntity}
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
          {...assignDialogProps(assignTarget, entity)}
          onClose={() => {
            setAssignTarget(null);
            setShowAddRelated(false);
          }}
          onAssign={(id, roleTag) =>
            addLink(
              showAddRelated
                ? {
                    ...assignTarget,
                    entityKind: "data_object",
                    linkKind: "related",
                    roleTags: ["many:1", "1:many"],
                  }
                : assignTarget,
              id,
              roleTag
            )
          }
        />
      )}

      {showAddRelated && !assignTarget && (
        <AssignDataLinkDialog
          section={{
            key: "related",
            title: "Related Entity",
            subtitle: "",
            entityKind: "data_object",
            linkKind: "related",
            items: [],
            actionLabel: "+ Add",
            roleTags: ["many:1", "1:many"],
          }}
          existingEntityIds={entity.related_entities.map((l) => l.entity_id)}
          assignedRoleByEntityId={Object.fromEntries(
            entity.related_entities.map((link) => [link.entity_id, link.role_tag ?? undefined])
          )}
          onClose={() => setShowAddRelated(false)}
          onAssign={(id, roleTag) => {
            void addLink(
              {
                key: "related",
                title: "Related Entity",
                subtitle: "",
                entityKind: "data_object",
                linkKind: "related",
                items: [],
              },
              id,
              roleTag
            );
            setShowAddRelated(false);
          }}
        />
      )}

      {showRelForm && (
        <RelationshipForm
          fromObject={liveObject ?? centerObject}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            refreshEntity();
          }}
        />
      )}

      {showChart && (
        <SystemDiagramModal
          system={liveObject ?? centerObject}
          relationships={drawerRels}
          accentColor={DATA_OBJECT_ACCENT}
          heading="Data entity relationships"
          footerHint="Drag nodes to rearrange — positions save automatically. Use Add connection to link systems, data domains, and other architecture objects."
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
