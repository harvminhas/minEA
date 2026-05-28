"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2, Zap } from "lucide-react";
import type { EventProperties, MinEAObject, ObjectListResponse } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { CreateEventPanel } from "@/components/integration/CreateEventPanel";
import { EventDiagramModal, type NodeLayout } from "@/components/integration/EventDiagram";
import { EventDiagramPreview } from "@/components/integration/EventDiagramPreview";
import {
  EVENT_AUDIENCES,
  EVENT_CRITICALITY,
  EVENT_DELIVERY_LABEL,
  formatProducerLabel,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/event-utils";
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
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const props = (event.properties ?? {}) as EventProperties;
  const subscribers = props.subscribers ?? [];

  const eventsQueryKey = ["objects", orgSlug, workspaceSlug, "event"] as const;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, event.id, token!);
    },
    onSuccess: onDelete,
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const cached = queryClient.getQueryData<ObjectListResponse>(eventsQueryKey);
      const current = cached?.items.find((o) => o.id === event.id) ?? event;
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

      queryClient.setQueryData<ObjectListResponse>(eventsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) =>
            o.id === event.id
              ? { ...o, properties: { ...currentProps, node_layout: layout } }
              : o
          ),
        };
      });
    },
    [getToken, orgSlug, workspaceSlug, event, queryClient, eventsQueryKey]
  );

  const handleResetLayout = useCallback(() => {
    handleLayoutSave({});
  }, [handleLayoutSave]);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: INTEGRATION_LAYER_COLOR }}
              >
                <Zap size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{event.name}</h2>
                <p className="text-sm text-gray-400">Event</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {event.status && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                    getStatusColor(event.status)
                  )}
                >
                  {getStatusLabel(event.status)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Edit event"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Delete event"
              >
                <Trash2 size={14} />
              </button>
              <DetailPanelCloseButton onClose={onClose} />
            </div>
          </div>
        }
        footer={
          <div className="border-t border-gray-100 px-6 py-3">
            <p className="text-xs text-gray-400">
              Updated {new Date(event.updated_at).toLocaleDateString()}
            </p>
          </div>
        }
      >
        {event.description && (
          <DetailSection title="Description">
            <p className="text-sm text-gray-700">{event.description}</p>
          </DetailSection>
        )}

        <DetailSection title="Architecture">
          <EventDiagramPreview event={event} onExpand={() => setShowChart(true)} />
          <p className="text-xs text-gray-400 mt-2">
            {props.producer ? formatProducerLabel(props.producer) : "No producer"}
            {subscribers.length > 0 && ` · ${subscribers.length} subscriber${subscribers.length !== 1 ? "s" : ""}`}
            {props.topic && ` · ${props.topic}`}
          </p>
        </DetailSection>

        <DetailSection title="Producer & subscribers">
          <div className="space-y-2 text-sm">
            {props.producer && (
              <DetailRow label="Producer" value={formatProducerLabel(props.producer)} />
            )}
            {subscribers.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Subscribers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {subscribers.map((s) => (
                    <span
                      key={s.subscriber_id ?? s.subscriber_name}
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border",
                        s.subscriber_kind === "custom"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-teal-50 text-teal-700 border-teal-100"
                      )}
                    >
                      {s.subscriber_name}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No subscribers yet</p>
            )}
          </div>
        </DetailSection>

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
            {event.owner && <DetailRow label="Owner" value={event.owner} />}
            {props.audience && (
              <DetailRow label="Audience" value={AUDIENCE_LABEL[props.audience] ?? props.audience} />
            )}
            {props.criticality && (
              <DetailRow
                label="Criticality"
                value={CRITICALITY_LABEL[props.criticality] ?? props.criticality}
              />
            )}
            {event.tags.length > 0 && <DetailRow label="Tags" value={event.tags.join(", ")} />}
          </div>
        </DetailSection>
      </DetailPanel>

      {showChart && (
        <EventDiagramModal
          event={event}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
        />
      )}

      {showEditForm && (
        <CreateEventPanel
          initialValues={event}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            onUpdate();
          }}
        />
      )}
    </>
  );
}
