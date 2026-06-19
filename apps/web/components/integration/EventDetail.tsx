"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import type { EventProperties, MinEAObject, ObjectListResponse, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import {
  architectureRelationshipsFromEvent,
  mergeArchitectureRelationships,
  persistEventArchitecture,
} from "@/lib/event-relationship-utils";
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
import { CreateEventPanel } from "@/components/integration/CreateEventPanel";
import { EventDiagramModal, type NodeLayout } from "@/components/integration/EventDiagram";
import { EventRelationshipsTab } from "@/components/integration/EventRelationshipsTab";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import {
  EVENT_AUDIENCES,
  EVENT_CRITICALITY,
  EVENT_DELIVERY_LABEL,
  formatEventSubtitle,
} from "@/lib/event-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

const AUDIENCE_LABEL = Object.fromEntries(EVENT_AUDIENCES.map((a) => [a.value, a.label]));
const CRITICALITY_LABEL = Object.fromEntries(EVENT_CRITICALITY.map((c) => [c.value, c.label]));

interface Props {
  event: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function EventDetail({ event, onClose, onDelete, onUpdate }: Props) {
  const { canEdit, canDelete } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(event.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveEvent, setLiveEvent] = useState(event);
  const [relationshipsSnapshot, setRelationshipsSnapshot] = useState<Relationship[] | null>(null);
  const liveEventRef = useRef(event);

  useEffect(() => {
    setLiveEvent(event);
    liveEventRef.current = event;
  }, [event.id, event.updated_at]);

  useEffect(() => {
    setRelationshipsSnapshot(null);
  }, [event.id]);

  const props = (liveEvent.properties ?? {}) as EventProperties;

  const eventsQueryKey = ["objects", orgSlug, workspaceSlug, "event"] as const;

  const { data: outRels } = useQuery({
    queryKey: ["relationships", "from", event.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: event.id }, token!);
    },
    staleTime: 0,
  });

  const { data: inRels } = useQuery({
    queryKey: ["relationships", "to", event.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: event.id }, token!);
    },
    staleTime: 0,
  });

  const drawerRels = useMemo(() => {
    const eventRels = relationshipsSnapshot ?? [...(outRels ?? []), ...(inRels ?? [])];
    return excludeTechDebtRelationships(mergeArchitectureRelationships(eventRels, liveEvent));
  }, [relationshipsSnapshot, outRels, inRels, liveEvent]);

  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, event.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, event.id, token!);
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

  const refreshEvent = () => {
    queryClient.invalidateQueries({ queryKey: eventsQueryKey });
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
  };

  const syncRelationshipsFromServer = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const { outbound, inbound } = await refreshObjectRelationshipQueries(
      queryClient,
      orgSlug,
      workspaceSlug,
      event.id,
      token
    );
    setRelationshipsSnapshot(excludeTechDebtRelationships([...outbound, ...inbound]));
  }, [getToken, queryClient, orgSlug, workspaceSlug, event.id]);

  const handleArchitectureChange = useCallback(
    async (updates: Parameters<typeof persistEventArchitecture>[3]) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const updated = await persistEventArchitecture(
        orgSlug,
        workspaceSlug,
        liveEventRef.current,
        updates,
        token
      );
      setLiveEvent(updated);
      liveEventRef.current = updated;
      setRelationshipsSnapshot(
        excludeTechDebtRelationships(architectureRelationshipsFromEvent(updated))
      );
      await syncRelationshipsFromServer();
      queryClient.setQueryData<ObjectListResponse>(eventsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === updated.id ? updated : o)),
        };
      });
      refreshEvent();
      onUpdate();
      return updated;
    },
    [
      getToken,
      orgSlug,
      workspaceSlug,
      event.id,
      queryClient,
      eventsQueryKey,
      onUpdate,
      syncRelationshipsFromServer,
    ]
  );

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, event.id, token!);
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

      const current = liveEventRef.current;
      const currentProps = (current.properties ?? {}) as EventProperties;

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        event.id,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      const withLayout = {
        ...current,
        properties: { ...currentProps, node_layout: layout },
      };

      queryClient.setQueryData<ObjectListResponse>(eventsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) => (o.id === event.id ? withLayout : o)),
        };
      });

      setLiveEvent(withLayout);
      liveEventRef.current = withLayout;
    },
    [getToken, orgSlug, workspaceSlug, event.id, queryClient, eventsQueryKey]
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
                  <Zap size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{liveEvent.name}</h2>
                  <p className="text-sm text-gray-400">
                    {formatEventSubtitle(props.topic, props.delivery)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {liveEvent.status && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      getStatusColor(liveEvent.status)
                    )}
                  >
                    {getStatusLabel(liveEvent.status)}
                  </span>
                )}
                <DetailObjectActions
                  onClose={onClose}
                  onEdit={() => setShowEditForm(true)}
                  onDelete={() => setShowDeleteConfirm(true)}
                  deletePending={deleteMutation.isPending}
                  editLabel="Edit event"
                  deleteLabel="Delete event"
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
              Updated{liveEvent.updated_by_name ? ` by ${liveEvent.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(liveEvent.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "relationships" ? (
          <EventRelationshipsTab
            event={liveEvent}
            relationships={drawerRels}
            onExpandDiagram={() => setShowChart(true)}
          />
        ) : activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={liveEvent.id}
            objectName={liveEvent.name}
            objectKind="event"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={liveEvent.owner}
            onRefresh={refreshEvent}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            {liveEvent.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700">{liveEvent.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Contract">
              <div className="space-y-2 text-sm">
                {props.topic && (
                  <DetailRow
                    label="Topic"
                    value={[props.topic, props.version].filter(Boolean).join(" ")}
                  />
                )}
                {props.delivery && (
                  <DetailRow
                    label="Delivery"
                    value={EVENT_DELIVERY_LABEL[props.delivery] ?? props.delivery}
                  />
                )}
                {props.schema_ref && <DetailRow label="Schema" value={props.schema_ref} />}
              </div>
            </DetailSection>

            <DetailSection title="Governance">
              <div className="space-y-2 text-sm">
                {props.broker && <DetailRow label="Broker" value={props.broker.broker_name} />}
                <OwnershipDetailRow entity={liveEvent} />
                {props.audience && (
                  <DetailRow label="Audience" value={AUDIENCE_LABEL[props.audience] ?? props.audience} />
                )}
                {props.criticality && (
                  <DetailRow
                    label="Criticality"
                    value={CRITICALITY_LABEL[props.criticality] ?? props.criticality}
                  />
                )}
                {liveEvent.tags.length > 0 && <DetailRow label="Tags" value={liveEvent.tags.join(", ")} />}
              </div>
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete event"
          message={`Are you sure you want to delete "${liveEvent.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <EventDiagramModal
          event={liveEvent}
          onClose={() => setShowChart(false)}
          onLayoutSave={canEdit ? handleLayoutSave : undefined}
          onResetLayout={canEdit ? handleResetLayout : undefined}
          onArchitectureChange={canEdit ? handleArchitectureChange : undefined}
        />
      )}

      {canEdit && showEditForm && (
        <CreateEventPanel
          initialValues={liveEvent}
          onClose={() => setShowEditForm(false)}
          onSuccess={(updated) => {
            setShowEditForm(false);
            setLiveEvent(updated);
            liveEventRef.current = updated;
            refreshEvent();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
