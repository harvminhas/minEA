"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Info, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { syncEventRelationships } from "@/lib/event-relationship-utils";
import { refreshObjectRelationshipQueries } from "@/lib/relationship-query-utils";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddSubscriberDialog } from "@/components/integration/AddSubscriberDialog";
import { EventDiagramModal, type NodeLayout } from "@/components/integration/EventDiagram";
import { EventDiagramPreview } from "@/components/integration/EventDiagramPreview";
import { PickProducerDialog } from "@/components/integration/PickProducerDialog";
import {
  eventBrokerCarrierOptions,
  formatCarrierOptionLabel,
  infraCarrierFieldHint,
  integrationInfraToolsQueryKey,
} from "@/lib/integration-infra-carriers";
import {
  brokerKeyFromRef,
  brokerRefFromKey,
  buildEventDraft,
  normalizeEventBrokerRef,
  EVENT_AUDIENCES,
  EVENT_CRITICALITY,
  EVENT_DELIVERY,
  EVENT_STATUSES,
  formatProducerLabel,
} from "@/lib/event-utils";
import type {
  EventBrokerRef,
  EventProducerRef,
  EventProperties,
  EventSubscriberRef,
  MinEAObject,
  ObjectStatus,
} from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: (event: MinEAObject) => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">{children}</p>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
      >
        {allowEmpty && <option value="">{placeholder ?? "None"}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>
  );
}

function initFromEvent(event?: MinEAObject) {
  const props = (event?.properties ?? {}) as EventProperties;
  return {
    name: event?.name ?? "",
    description: event?.description ?? "",
    tags: (event?.tags ?? []).join(", "),
    topic: props.topic ?? "",
    version: props.version ?? "",
    schemaRef: props.schema_ref ?? "",
    delivery: props.delivery ?? "at_least_once",
    producer: props.producer ?? null,
    subscribers: props.subscribers ?? [],
    brokerKey: brokerKeyFromRef(props.broker ?? null),
    audience: props.audience ?? "internal",
    criticality: props.criticality ?? "low",
    owner: event?.owner ?? "",
    status: (event?.status ?? "planned") as ObjectStatus,
    draftLayout: props.node_layout ?? {},
  };
}

function subscriberChipClass(sub: EventSubscriberRef) {
  if (sub.subscriber_kind === "custom") {
    const lower = sub.subscriber_name.toLowerCase();
    if (lower.includes("partner")) return "bg-amber-50 text-amber-800 border-amber-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  }
  return "bg-teal-50 text-teal-700 border-teal-100";
}

export function CreateEventPanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromEvent(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const eventsQueryKey = ["objects", orgSlug, workspaceSlug, "event"] as const;
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [topic, setTopic] = useState(init.topic);
  const [version, setVersion] = useState(init.version);
  const [schemaRef, setSchemaRef] = useState(init.schemaRef);
  const [delivery, setDelivery] = useState<string>(init.delivery);
  const [producer, setProducer] = useState<EventProducerRef | null>(init.producer);
  const [subscribers, setSubscribers] = useState<EventSubscriberRef[]>(init.subscribers);
  const [brokerKey, setBrokerKey] = useState(init.brokerKey);
  const [audience, setAudience] = useState<string>(init.audience);
  const [criticality, setCriticality] = useState<string>(init.criticality);
  const ownership = useOwnershipForm(init);
  const [status, setStatus] = useState<ObjectStatus>(init.status);
  const [error, setError] = useState<string | null>(null);
  const [showProducerDialog, setShowProducerDialog] = useState(false);
  const [showSubscriberDialog, setShowSubscriberDialog] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [draftLayout, setDraftLayout] = useState<NodeLayout>(init.draftLayout);

  useEffect(() => setMounted(true), []);

  const { data: infraToolsData } = useQuery({
    queryKey: integrationInfraToolsQueryKey(orgSlug, workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tool" }, token!);
    },
    enabled,
  });

  const { data: legacyBrokersData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "message_broker"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "message_broker" }, token!);
    },
    enabled,
  });

  const registeredBrokers = useMemo(
    () =>
      eventBrokerCarrierOptions(
        infraToolsData?.items ?? [],
        legacyBrokersData?.items ?? []
      ),
    [infraToolsData, legacyBrokersData]
  );

  const selectedBroker: EventBrokerRef | null = useMemo(() => {
    const ref = brokerRefFromKey(brokerKey, registeredBrokers);
    if (ref) return ref;
    if (brokerKey.startsWith("registered:") && initialValues) {
      const initBroker = ((initialValues.properties ?? {}) as EventProperties).broker;
      if (initBroker?.broker_id === brokerKey.slice(11)) {
        return normalizeEventBrokerRef(initBroker);
      }
    }
    return null;
  }, [brokerKey, registeredBrokers, initialValues]);

  const draftEvent = useMemo(
    () =>
      buildEventDraft({
        name,
        topic,
        version,
        schemaRef,
        delivery,
        producer,
        subscribers,
        broker: selectedBroker,
        audience,
        criticality,
        status,
        owner: ownership.toPayload().owner,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        nodeLayout: Object.keys(draftLayout).length > 0 ? draftLayout : undefined,
      }),
    [
      name,
      topic,
      version,
      schemaRef,
      delivery,
      producer,
      subscribers,
      selectedBroker,
      audience,
      criticality,
      status,
      ownership.value,
      tags,
      draftLayout,
    ]
  );

  const canSubmit =
    name.trim().length > 0 && topic.trim().length > 0 && !!producer && !!selectedBroker && ownership.isValid;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!producer) throw new Error("Producer is required");
      const broker = normalizeEventBrokerRef(selectedBroker);
      if (!broker) throw new Error("Broker is required");

      const previousBrokerId = isEdit
        ? (((initialValues?.properties ?? {}) as EventProperties).broker?.broker_id ?? null)
        : null;

      const existingLayout = ((initialValues?.properties ?? {}) as EventProperties).node_layout;
      const properties: EventProperties = {
        topic: topic.trim(),
        version: version.trim() || undefined,
        schema_ref: schemaRef.trim() || undefined,
        delivery: delivery as EventProperties["delivery"],
        producer,
        subscribers,
        broker,
        audience: audience as EventProperties["audience"],
        criticality: criticality as EventProperties["criticality"],
        node_layout: Object.keys(draftLayout).length > 0 ? draftLayout : existingLayout,
      };

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        ...ownership.toPayload(),
        status,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: properties as Record<string, unknown>,
      };

      if (isEdit && initialValues) {
        const event = await objectsApi.update(orgSlug, workspaceSlug, initialValues.id, body, token);
        await syncEventRelationships(
          orgSlug,
          workspaceSlug,
          initialValues.id,
          producer,
          subscribers,
          broker,
          token
        );
        return { event, previousBrokerId };
      }

      const event = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "event", ...body },
        token
      );
      await syncEventRelationships(
        orgSlug,
        workspaceSlug,
        event.id,
        producer,
        subscribers,
        broker,
        token
      );
      return { event, previousBrokerId: null };
    },
    onSuccess: async ({ event, previousBrokerId }) => {
      const savedProps = (event.properties ?? {}) as EventProperties;
      const savedEvent: MinEAObject = {
        ...event,
        properties: {
          ...savedProps,
          broker: normalizeEventBrokerRef(savedProps.broker ?? null) ?? undefined,
        },
      };

      queryClient.setQueryData(eventsQueryKey, (old: { items: MinEAObject[] } | undefined) => {
        if (!old) return old;
        const exists = old.items.some((o) => o.id === savedEvent.id);
        return {
          ...old,
          items: exists
            ? old.items.map((o) => (o.id === savedEvent.id ? savedEvent : o))
            : [savedEvent, ...old.items],
        };
      });

      const token = await getToken();
      const brokerIds = new Set(
        [previousBrokerId, ((savedEvent.properties ?? {}) as EventProperties).broker?.broker_id].filter(
          Boolean
        ) as string[]
      );
      if (token) {
        for (const brokerId of brokerIds) {
          await refreshObjectRelationshipQueries(
            queryClient,
            orgSlug,
            workspaceSlug,
            brokerId,
            token
          );
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["objects", orgSlug, workspaceSlug, "event", "infra-refs"],
      });

      onSuccess(savedEvent);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} event`),
  });

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={cn("fixed inset-0 bg-black/25", isEdit ? "z-[115]" : "z-[100]")} onClick={onClose} />

      <div className={cn(
        "fixed right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl flex flex-col",
        isEdit ? "z-[120]" : "z-[110]"
      )}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{isEdit ? "Edit event" : "Document event"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">A message one producer emits for others to react to</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-7">
            <section>
              <SectionHeader>Producer &amp; subscribers</SectionHeader>

              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <FieldLabel required>Producer</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setShowProducerDialog(true)}
                    className={cn(
                      "w-full text-left rounded-lg border min-h-[88px] p-3 transition-colors",
                      producer
                        ? "border-gray-200 bg-white hover:border-teal-300"
                        : "border-dashed border-gray-300 bg-gray-50/50 hover:border-teal-300"
                    )}
                  >
                    {producer ? (
                      <span className="text-sm font-medium text-gray-800 truncate block">
                        {formatProducerLabel(producer)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Select system, component, or entity…</span>
                    )}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    The system, component, or entity emitting the event
                  </p>
                </div>

                <div className="flex flex-col items-center pt-7 flex-shrink-0 w-10">
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                    <ArrowRight size={14} />
                  </div>
                  <span className="mt-1 text-[9px] font-semibold text-gray-400 whitespace-nowrap">fan out</span>
                </div>

                <div className="flex-1 min-w-0">
                  <FieldLabel>Subscribers</FieldLabel>
                  <div className="rounded-lg border border-gray-200 min-h-[88px] p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {subscribers.map((s) => (
                        <span
                          key={s.subscriber_id ?? s.subscriber_name}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
                            subscriberChipClass(s)
                          )}
                        >
                          {s.subscriber_name}
                          <button
                            type="button"
                            onClick={() =>
                              setSubscribers((list) =>
                                list.filter(
                                  (x) =>
                                    (x.subscriber_id ?? x.subscriber_name) !==
                                    (s.subscriber_id ?? s.subscriber_name)
                                )
                              )
                            }
                            className="opacity-60 hover:opacity-100"
                            aria-label={`Remove ${s.subscriber_name}`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowSubscriberDialog(true)}
                        className="inline-flex items-center gap-1 text-xs text-teal-600 border border-dashed border-teal-300 px-2 py-0.5 rounded-full hover:bg-teal-50 transition-colors"
                      >
                        <Plus size={12} />
                        Add subscriber
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Often unknown — anyone on the broker can subscribe
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
                <Info size={13} className="text-teal-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-teal-800">
                  Subscribers can be added over time as they&apos;re discovered.
                </p>
              </div>
            </section>

            <section>
              <SectionHeader>Identity</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Name</FieldLabel>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Order Created"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened? When is it emitted?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="orders, domain-events"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Contract</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <FieldLabel required>Topic / event name</FieldLabel>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. order.created"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">The technical identifier on the broker</p>
                </div>
                <div>
                  <FieldLabel>Version</FieldLabel>
                  <input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g. v1"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Delivery</FieldLabel>
                  <SelectField value={delivery} onChange={setDelivery} options={EVENT_DELIVERY} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Schema reference</FieldLabel>
                  <input
                    value={schemaRef}
                    onChange={(e) => setSchemaRef(e.target.value)}
                    placeholder="URL to JSON Schema, Avro, or registry entry"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Infrastructure</SectionHeader>
              <div>
                <FieldLabel required>Broker / transport</FieldLabel>
                <div className="relative">
                  <select
                    value={brokerKey}
                    onChange={(e) => setBrokerKey(e.target.value)}
                    className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                  >
                    <option value="" disabled={registeredBrokers.length === 0}>
                      {registeredBrokers.length > 0
                        ? "Select integration infrastructure…"
                        : "No event infrastructure available"}
                    </option>
                    {registeredBrokers.length > 0 && (
                      <optgroup label="Integration infrastructure">
                        {registeredBrokers.map((b) => (
                          <option key={b.id} value={`registered:${b.id}`}>
                            {formatCarrierOptionLabel(b)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                    ▾
                  </span>
                </div>
                {(() => {
                  const hint = infraCarrierFieldHint("events", registeredBrokers.length > 0);
                  return (
                    <p
                      className={cn(
                        "text-[11px] mt-1.5",
                        hint.tone === "notice" ? "text-amber-700" : "text-gray-400"
                      )}
                    >
                      {hint.text}
                    </p>
                  );
                })()}
                <p className="text-[11px] text-gray-400 mt-1">
                  Where the event physically travels — connection &amp; retention live here
                </p>
              </div>
            </section>

            <section>
              <SectionHeader>Architecture</SectionHeader>
              <p className="text-xs text-gray-400 mb-2">
                Preview updates as you assign producer, subscribers, and broker.
              </p>
              <EventDiagramPreview event={draftEvent} onExpand={() => setShowChart(true)} />
            </section>

            <section>
              <SectionHeader>Governance</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />
                </div>
                <div>
                  <FieldLabel>Lifecycle</FieldLabel>
                  <SelectField
                    value={status}
                    onChange={(v) => setStatus(v as ObjectStatus)}
                    options={EVENT_STATUSES}
                  />
                </div>
                <div>
                  <FieldLabel>Audience</FieldLabel>
                  <SelectField value={audience} onChange={setAudience} options={EVENT_AUDIENCES} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Criticality</FieldLabel>
                  <SelectField value={criticality} onChange={setCriticality} options={EVENT_CRITICALITY} />
                </div>
              </div>
            </section>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSubmit || saveMutation.isPending}
            className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save" : "Save documentation"}
          </button>
        </div>
      </div>

      {showProducerDialog && (
        <PickProducerDialog
          selected={producer}
          onClose={() => setShowProducerDialog(false)}
          onApply={(next) => {
            setProducer(next);
            setShowProducerDialog(false);
          }}
        />
      )}

      {showSubscriberDialog && (
        <AddSubscriberDialog
          selected={subscribers}
          onClose={() => setShowSubscriberDialog(false)}
          onApply={(next) => {
            setSubscribers(next);
            setShowSubscriberDialog(false);
          }}
        />
      )}

      {showChart && (
        <EventDiagramModal
          event={draftEvent}
          onClose={() => setShowChart(false)}
          onLayoutSave={setDraftLayout}
          onResetLayout={() => setDraftLayout({})}
        />
      )}

    </>,
    document.body
  );
}
