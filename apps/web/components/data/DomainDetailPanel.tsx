"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { dataApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { DataFormFooter, DataSelect } from "@/components/data/DataDetailShell";
import { DataGovernanceGapBanner } from "@/components/data/DataGovernanceGapBanner";
import {
  DataRepositoryRelationshipsTab,
  DATA_DOMAIN_ACCENT,
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
import { usePermissions } from "@/lib/use-permissions";
import {
  countUnassignedEntities,
  countUnassignedStores,
} from "@/lib/data-domain-assignment";
import type { MinEAObject } from "@minea/types";

interface Props {
  domainId: string;
  onClose: () => void;
  onUpdate: () => void;
}

function RollupList({
  items,
  emptyLabel,
}: {
  items: { id: string; name: string }[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-2 rounded-lg border border-gray-200/80 bg-white px-3 py-2.5 text-sm text-gray-800"
        >
          <span className="font-medium">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function DomainDetailPanel({ domainId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const enabled = useAuthQueryEnabled(domainId);

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const [owningTeam, setOwningTeam] = useState("");
  const [stewardName, setStewardName] = useState("");
  const [stewardEmail, setStewardEmail] = useState("");
  const [classification, setClassification] = useState("");
  const [description, setDescription] = useState("");
  const [showRelForm, setShowRelForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [liveObject, setLiveObject] = useState<MinEAObject | null>(null);
  const liveObjectRef = useRef<MinEAObject | null>(null);
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(domainId);

  const { data: domain, isLoading } = useQuery({
    queryKey: ["data-domain", orgSlug, workspaceSlug, domainId],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getDomain(orgSlug, workspaceSlug, domainId, token!);
    },
    enabled,
  });

  const { data: centerObject, isLoading: objectLoading } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, domainId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, domainId, token!);
    },
    enabled,
  });

  const { data: outRels, isFetching: outRelsFetching } = useQuery({
    queryKey: ["relationships", "from", domainId],
    enabled: !!centerObject,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: domainId }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels, isFetching: inRelsFetching } = useQuery({
    queryKey: ["relationships", "to", domainId],
    enabled: !!centerObject,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: domainId }, token!);
    },
    staleTime: 0,
  });

  const diagramRefreshing = outRelsFetching || inRelsFetching;
  const drawerRels = excludeTechDebtRelationships([...(outRels ?? []), ...(inRels ?? [])]);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["object-history", orgSlug, workspaceSlug, domainId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, domainId, token!);
    },
    enabled: activeTab === "history",
  });

  const { data: entitiesData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "data_object"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "data_object" }, token!);
    },
    enabled,
  });

  const { data: storesData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "data_store"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "data_store" }, token!);
    },
    enabled,
  });

  useEffect(() => {
    if (!centerObject) return;
    setLiveObject(centerObject);
    liveObjectRef.current = centerObject;
  }, [centerObject]);

  useEffect(() => {
    if (!domain) return;
    setOwningTeam(domain.owning_team ?? "");
    setStewardName(domain.steward_name ?? "");
    setStewardEmail(domain.steward_email ?? "");
    setClassification(domain.classification ?? "");
    setDescription(domain.description ?? "");
  }, [domain]);

  const refreshDomain = () => {
    queryClient.invalidateQueries({ queryKey: ["data-domain", orgSlug, workspaceSlug, domainId] });
    queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, domainId] });
    queryClient.invalidateQueries({ queryKey: ["relationships"] });
    onUpdate();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return dataApi.updateDomain(orgSlug, workspaceSlug, domainId, {
        owning_team: owningTeam || null,
        steward_name: stewardName || null,
        steward_email: stewardEmail || null,
        classification: classification || null,
        description: description || null,
      }, token!);
    },
    onSuccess: () => {
      refreshDomain();
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
      refreshDomain();
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
        domainId,
        {
          properties: { ...currentProps, node_layout: layout },
        },
        token
      );

      setLiveObject(updated);
      liveObjectRef.current = updated;
      queryClient.setQueryData(["object", orgSlug, workspaceSlug, domainId], updated);
    },
    [getToken, orgSlug, workspaceSlug, domainId, queryClient, centerObject]
  );

  const handleResetLayout = useCallback(() => {
    void handleLayoutSave({});
  }, [handleLayoutSave]);

  const relationshipCount = drawerRels.length;

  if (isLoading || objectLoading || !domain || !centerObject) {
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

  const rollup = domain.domain_rollup ?? { entities: [], stores: [], systems: [] };
  const unassignedEntityCount = countUnassignedEntities(entitiesData?.items ?? []);
  const unassignedStoreCount = countUnassignedStores(storesData?.items ?? []);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="border-b border-gray-100">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 bg-violet-600">
                  <Flag size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{domain.name}</h2>
                  <p className="text-sm text-gray-400 truncate">
                    Data domain · Owner: {owningTeam || "Unassigned"}
                  </p>
                </div>
              </div>
              <DetailPanelCloseButton onClose={onClose} />
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
                Updated {new Date(domain.updated_at).toLocaleDateString()}
              </p>
            </div>
          )
        }
      >
        {activeTab === "details" && (
          <>
            <DataGovernanceGapBanner
              unassignedEntityCount={unassignedEntityCount}
              unassignedStoreCount={unassignedStoreCount}
              focus="all"
            />

            <DetailSection title="Owning team">
              <input
                value={owningTeam}
                onChange={(e) => setOwningTeam(e.target.value)}
                placeholder="Payments team"
                disabled={!canEdit}
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50"
              />
            </DetailSection>

            <DetailSection title="Data steward">
              <div className="rounded-md border border-gray-200 overflow-hidden">
                <input
                  value={stewardName}
                  onChange={(e) => setStewardName(e.target.value)}
                  placeholder="Name"
                  disabled={!canEdit}
                  className="w-full px-3 py-2.5 text-sm border-b border-gray-100 focus:outline-none focus:bg-gray-50 disabled:bg-gray-50"
                />
                <input
                  value={stewardEmail}
                  onChange={(e) => setStewardEmail(e.target.value)}
                  placeholder="Email"
                  disabled={!canEdit}
                  className="w-full px-3 py-2.5 text-sm text-gray-500 focus:outline-none focus:bg-gray-50 disabled:bg-gray-50"
                />
              </div>
            </DetailSection>

            <DetailSection title="Classification">
              <DataSelect
                value={classification || "financial"}
                onChange={setClassification}
                options={[
                  { value: "financial", label: "Financial" },
                  { value: "customer", label: "Customer" },
                  { value: "operational", label: "Operational" },
                  { value: "reference", label: "Reference" },
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

            {domain.capability_domain_name && (
              <DetailSection
                title="Capability alignment"
                hint="Soft alignment with a business capability domain — informational only."
              >
                <p className="text-sm font-medium text-gray-900">{domain.capability_domain_name}</p>
              </DetailSection>
            )}

            <DetailSection
              title="Entities in this domain"
              hint="Assign from each entity's Details tab. Many entities can belong to one domain."
            >
              <RollupList
                items={rollup.entities}
                emptyLabel="No entities assigned yet — set domain on each entity record."
              />
            </DetailSection>

            <DetailSection
              title="Stores in this domain"
              hint="Assign from each store's Details tab. Many stores can belong to one domain."
            >
              <RollupList
                items={rollup.stores}
                emptyLabel="No stores assigned yet — set domain on each store record."
              />
            </DetailSection>

            <DetailSection
              title="Systems in this domain"
              hint="Computed from entity ownership and store access relationships."
            >
              <RollupList
                items={rollup.systems}
                emptyLabel="No systems linked to assigned entities or stores yet."
              />
            </DetailSection>
          </>
        )}

        {activeTab === "relationships" && (
          <DataRepositoryRelationshipsTab
            centerObject={liveObject ?? centerObject}
            relationships={drawerRels}
            objectType="data_domain"
            accentColor={DATA_DOMAIN_ACCENT}
            chipClassName="text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full"
            detailsTabHint="Domain membership and stewardship are edited on the Details tab. Use Add or expand the map for other repository relationships."
            diagramRefreshing={diagramRefreshing}
            onExpandDiagram={() => setShowChart(true)}
            onAddRepositoryRel={canEdit ? () => setShowRelForm(true) : undefined}
            onRemoveRepositoryRel={canEdit ? (id) => deleteRelMutation.mutate(id) : undefined}
            isRemovingRepositoryRel={deleteRelMutation.isPending}
          />
        )}

        {activeTab === "tech_debt" && (
          <ObjectTechDebtTab
            objectId={domainId}
            objectName={domain.name}
            objectKind="data_domain"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            onRefresh={refreshDomain}
          />
        )}

        {activeTab === "history" && (
          <EntityHistoryPanel
            entries={historyData?.entries ?? []}
            isLoading={historyLoading}
          />
        )}
      </DetailPanel>

      {showRelForm && (
        <RelationshipForm
          fromObject={liveObject ?? centerObject}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            refreshDomain();
          }}
        />
      )}

      {showChart && (
        <SystemDiagramModal
          system={liveObject ?? centerObject}
          relationships={drawerRels}
          accentColor={DATA_DOMAIN_ACCENT}
          heading="Data domain relationships"
          footerHint="Drag nodes to rearrange — positions save automatically. Use Add connection to link systems, entities, stores, and other architecture objects."
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
