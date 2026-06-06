"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Braces, Edit2, Trash2 } from "lucide-react";
import type { ApiProperties, MinEAObject, ObjectListResponse, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import {
  mergeArchitectureRelationships,
  persistApiArchitecture,
} from "@/lib/api-relationship-utils";
import { excludeTechDebtRelationships } from "@/lib/relationship-display";
import { refreshObjectRelationshipQueries } from "@/lib/relationship-query-utils";
import { useTenancy } from "@/lib/tenancy";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { CreateApiPanel } from "@/components/integration/CreateApiPanel";
import { ApiDiagramModal, type NodeLayout } from "@/components/integration/ApiDiagram";
import { ApiRelationshipsTab } from "@/components/integration/ApiRelationshipsTab";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import {
  API_AUDIENCES,
  API_AUTH_LABEL,
  API_CRITICALITY,
  API_STYLE_LABEL,
  formatApiSubtitle,
  formatProviderLabel,
} from "@/lib/api-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

const AUDIENCE_LABEL = Object.fromEntries(API_AUDIENCES.map((a) => [a.value, a.label]));
const CRITICALITY_LABEL = Object.fromEntries(API_CRITICALITY.map((c) => [c.value, c.label]));

interface Props {
  api: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function ApiDetail({ api, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(api.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveApi, setLiveApi] = useState(api);
  const [relationshipsSnapshot, setRelationshipsSnapshot] = useState<Relationship[] | null>(null);
  const liveApiRef = useRef(api);

  useEffect(() => {
    setLiveApi(api);
    liveApiRef.current = api;
  }, [api.id, api.updated_at]);

  useEffect(() => {
    setRelationshipsSnapshot(null);
  }, [api.id]);

  const props = (liveApi.properties ?? {}) as ApiProperties;
  const styleLabel = API_STYLE_LABEL[props.protocol ?? ""] ?? props.protocol;
  const consumers = props.consumers ?? [];

  const apisQueryKey = ["objects", orgSlug, workspaceSlug, "api"] as const;

  const { data: outRels } = useQuery({
    queryKey: ["relationships", "from", api.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: api.id }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels } = useQuery({
    queryKey: ["relationships", "to", api.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: api.id }, token!);
    },
    staleTime: 0,
  });

  const drawerRels = useMemo(() => {
    const apiRels = relationshipsSnapshot ?? [...(outRels ?? []), ...(inRels ?? [])];
    return excludeTechDebtRelationships(mergeArchitectureRelationships(apiRels, liveApi));
  }, [relationshipsSnapshot, outRels, inRels, liveApi]);

  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, api.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, api.id, token!);
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

  const refreshApi = () => {
    queryClient.invalidateQueries({ queryKey: apisQueryKey });
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
  };

  const syncRelationshipsFromServer = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const { outbound, inbound } = await refreshObjectRelationshipQueries(
      queryClient,
      orgSlug,
      workspaceSlug,
      api.id,
      token
    );
    setRelationshipsSnapshot(
      excludeTechDebtRelationships(
        mergeArchitectureRelationships([...outbound, ...inbound], liveApiRef.current)
      )
    );
  }, [getToken, queryClient, orgSlug, workspaceSlug, api.id]);

  const handleArchitectureChange = useCallback(
    async (updates: Parameters<typeof persistApiArchitecture>[3]) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const previousProviderId = (
        (liveApiRef.current.properties ?? {}) as ApiProperties
      ).provider?.provider_id;

      const updated = await persistApiArchitecture(
        orgSlug,
        workspaceSlug,
        liveApiRef.current,
        updates,
        token
      );
      setLiveApi(updated);
      liveApiRef.current = updated;

      const nextProviderId = ((updated.properties ?? {}) as ApiProperties).provider?.provider_id;
      const refreshIds = new Set(
        [api.id, previousProviderId, nextProviderId].filter(Boolean) as string[]
      );
      let mergedRels: Relationship[] = [];
      for (const objectId of refreshIds) {
        const { outbound, inbound } = await refreshObjectRelationshipQueries(
          queryClient,
          orgSlug,
          workspaceSlug,
          objectId,
          token
        );
        if (objectId === api.id) {
          mergedRels = mergeArchitectureRelationships([...outbound, ...inbound], updated);
        }
      }
      setRelationshipsSnapshot(excludeTechDebtRelationships(mergedRels));
      queryClient.setQueryData<ObjectListResponse>(apisQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === updated.id ? updated : o)),
        };
      });
      refreshApi();
      onUpdate();
      return updated;
    },
    [
      getToken,
      orgSlug,
      workspaceSlug,
      api.id,
      queryClient,
      apisQueryKey,
      onUpdate,
    ]
  );

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, api.id, token!);
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

      const current = liveApiRef.current;
      const currentProps = (current.properties ?? {}) as ApiProperties;

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        api.id,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...current,
        properties: { ...currentProps, node_layout: layout },
      };

      queryClient.setQueryData<ObjectListResponse>(apisQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === api.id ? withLayout : o)),
        };
      });

      setLiveApi(withLayout);
      liveApiRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, api.id, queryClient, apisQueryKey]
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
                  <Braces size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{liveApi.name}</h2>
                  <p className="text-sm text-gray-400">{formatApiSubtitle(props.protocol)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {liveApi.status && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      getStatusColor(liveApi.status)
                    )}
                  >
                    {getStatusLabel(liveApi.status)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit API"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete API"
                >
                  <Trash2 size={14} />
                </button>
                <DetailPanelCloseButton onClose={onClose} />
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
              Updated{liveApi.updated_by_name ? ` by ${liveApi.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(liveApi.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "relationships" ? (
          <ApiRelationshipsTab
            api={liveApi}
            relationships={drawerRels}
            onExpandDiagram={() => setShowChart(true)}
          />
        ) : activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={liveApi.id}
            objectName={liveApi.name}
            objectKind="api"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={liveApi.owner}
            onRefresh={refreshApi}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            {liveApi.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700">{liveApi.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Contract">
              <div className="space-y-2 text-sm">
                {styleLabel && (
                  <DetailRow
                    label="Style"
                    value={[styleLabel, props.version].filter(Boolean).join(" ")}
                  />
                )}
                {props.base_url && <DetailRow label="Base URL" value={props.base_url} />}
                {props.auth && (
                  <DetailRow label="Auth" value={API_AUTH_LABEL[props.auth] ?? props.auth} />
                )}
              </div>
            </DetailSection>

            <DetailSection title="Governance">
              <div className="space-y-2 text-sm">
                {liveApi.owner && <DetailRow label="Owner" value={liveApi.owner} />}
                {props.audience && (
                  <DetailRow label="Audience" value={AUDIENCE_LABEL[props.audience] ?? props.audience} />
                )}
                {props.criticality && (
                  <DetailRow
                    label="Criticality"
                    value={CRITICALITY_LABEL[props.criticality] ?? props.criticality}
                  />
                )}
                {props.gateway && <DetailRow label="Gateway" value={props.gateway.gateway_name} />}
                {liveApi.tags.length > 0 && <DetailRow label="Tags" value={liveApi.tags.join(", ")} />}
              </div>
            </DetailSection>

            <DetailSection title="Provider & consumers">
              <div className="space-y-2 text-sm">
                {props.provider && (
                  <DetailRow label="Provider" value={formatProviderLabel(props.provider)} />
                )}
                {consumers.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Consumers
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {consumers.map((c) => (
                        <span
                          key={c.consumer_id ?? c.consumer_name}
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full border",
                            c.consumer_kind === "custom"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-teal-50 text-teal-700 border-teal-100"
                          )}
                        >
                          {c.consumer_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No consumers — public or unknown callers</p>
                )}
              </div>
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete API"
          message={`Are you sure you want to delete "${liveApi.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <ApiDiagramModal
          api={liveApi}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
          onArchitectureChange={handleArchitectureChange}
        />
      )}

      {showEditForm && (
        <CreateApiPanel
          initialValues={liveApi}
          onClose={() => setShowEditForm(false)}
          onSuccess={async (apiId) => {
            setShowEditForm(false);
            const token = await getToken();
            if (token) {
              const nextApi = await objectsApi.get(orgSlug, workspaceSlug, apiId, token);
              setLiveApi(nextApi);
              liveApiRef.current = nextApi;
              const { outbound, inbound } = await refreshObjectRelationshipQueries(
                queryClient,
                orgSlug,
                workspaceSlug,
                apiId,
                token
              );
              setRelationshipsSnapshot(
                excludeTechDebtRelationships(
                  mergeArchitectureRelationships([...outbound, ...inbound], nextApi)
                )
              );
              const providerId = ((nextApi.properties ?? {}) as ApiProperties).provider?.provider_id;
              if (providerId) {
                await refreshObjectRelationshipQueries(
                  queryClient,
                  orgSlug,
                  workspaceSlug,
                  providerId,
                  token
                );
              }
            }
            refreshApi();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
