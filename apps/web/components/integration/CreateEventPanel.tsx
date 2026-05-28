"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Info, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddSubscriberDialog } from "@/components/integration/AddSubscriberDialog";
import { EventDiagramModal, type NodeLayout } from "@/components/integration/EventDiagram";
import { EventDiagramPreview } from "@/components/integration/EventDiagramPreview";
import { PickProducerDialog } from "@/components/integration/PickProducerDialog";
import { RegisterBrokerDialog } from "@/components/integration/RegisterBrokerDialog";
import {
  brokerKeyFromRef,
  brokerRefFromKey,
  buildEventDraft,
  EVENT_AUDIENCES,
  EVENT_BROKER_TRANSPORTS,
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
  onSuccess: (eventId: string) => void;
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

async function syncEventRelationships(
  orgSlug: string,
  workspaceSlug: string,
  eventId: string,
  producer: EventProducerRef | null,
  subscribers: EventSubscriberRef[],
  broker: EventBrokerRef | null,
  token: string
) {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { to_object_id: eventId },
    token
  );

  for (const rel of existing) {
    if (
      rel.to_type === "event" &&
      (rel.type === "publishes" || rel.type === "subscribes" || rel.type === "routes")
    ) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  if (producer) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "publishes",
        from_object_id: producer.producer_id,
        from_type: producer.producer_kind,
        to_object_id: eventId,
        to_type: "event",
      },
      token
    );
  }

  for (const sub of subscribers) {
    if (sub.subscriber_kind === "application" && sub.subscriber_id) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "subscribes",
          from_object_id: sub.subscriber_id,
          from_type: "application",
          to_object_id: eventId,
          to_type: "event",
        },
        token
      );
    } else if (sub.subscriber_kind === "component" && sub.subscriber_id) {
      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "subscribes",
          from_object_id: sub.subscriber_id,
          from_type: "component",
          to_object_id: eventId,
          to_type: "event",
        },
        token
      );
    }
  }

  if (broker?.broker_id) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "routes",
        from_object_id: broker.broker_id,
        from_type: "message_broker",
        to_object_id: eventId,
        to_type: "event",
      },
      token
    );
  }
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
  const enabled = useAuthQueryEnabled();
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
  const [owner, setOwner] = useState(init.owner);
  const [status, setStatus] = useState<ObjectStatus>(init.status);
  const [error, setError] = useState<string | null>(null);
  const [showProducerDialog, setShowProducerDialog] = useState(false);
  const [showSubscriberDialog, setShowSubscriberDialog] = useState(false);
  const [showRegisterBroker, setShowRegisterBroker] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [draftLayout, setDraftLayout] = useState<NodeLayout>(init.draftLayout);

  useEffect(() => setMounted(true), []);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const { data: brokersData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "message_broker"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "message_broker" }, token!);
    },
    enabled,
  });

  const registeredBrokers = useMemo(
    () =>
      (brokersData?.items ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        transport: (b.properties as Record<string, unknown>)?.transport as string | undefined,
      })),
    [brokersData]
  );

  const selectedBroker: EventBrokerRef | null = useMemo(
    () => brokerRefFromKey(brokerKey, registeredBrokers),
    [brokerKey, registeredBrokers]
  );

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
        owner: owner.trim() || undefined,
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
      owner,
      tags,
      draftLayout,
    ]
  );

  const canSubmit =
    name.trim().length > 0 && topic.trim().length > 0 && !!producer && !!selectedBroker;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!producer) throw new Error("Producer is required");
      if (!selectedBroker) throw new Error("Broker is required");

      const existingLayout = ((initialValues?.properties ?? {}) as EventProperties).node_layout;
      const properties: EventProperties = {
        topic: topic.trim(),
        version: version.trim() || undefined,
        schema_ref: schemaRef.trim() || undefined,
        delivery: delivery as EventProperties["delivery"],
        producer,
        subscribers,
        broker: selectedBroker,
        audience: audience as EventProperties["audience"],
        criticality: criticality as EventProperties["criticality"],
        node_layout: Object.keys(draftLayout).length > 0 ? draftLayout : existingLayout,
      };

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        owner: owner.trim() || undefined,
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
          selectedBroker,
          token
        );
        return event;
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
        selectedBroker,
        token
      );
      return event;
    },
    onSuccess: (event) => onSuccess(event.id),
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
            <h2 className="text-base font-semibold text-gray-900">{isEdit ? "Edit event" : "New event"}</h2>
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
                    onChange={(e) => {
                      if (e.target.value === "__register__") {
                        setShowRegisterBroker(true);
                        return;
                      }
                      setBrokerKey(e.target.value);
                    }}
                    className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                  >
                    <option value="" disabled>
                      Select transport or broker…
                    </option>
                    <optgroup label="Event transport / broker">
                      {EVENT_BROKER_TRANSPORTS.map((t) => (
                        <option key={t.value} value={`preset:${t.value}`}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                    {registeredBrokers.length > 0 && (
                      <optgroup label="Registered brokers">
                        {registeredBrokers.map((b) => (
                          <option key={b.id} value={`registered:${b.id}`}>
                            {b.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__register__">+ Register broker</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                    ▾
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
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
                  <FieldLabel>Owner (team)</FieldLabel>
                  <input
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    list="event-owner-options"
                    placeholder="Search team…"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <datalist id="event-owner-options">
                    {(teamsData?.items ?? []).map((team) => (
                      <option key={team.id} value={team.name} />
                    ))}
                  </datalist>
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
            {saveMutation.isPending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create event"}
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

      {showRegisterBroker && (
        <RegisterBrokerDialog
          defaultTransport={
            brokerKey.startsWith("preset:") ? brokerKey.slice(7) : undefined
          }
          onClose={() => setShowRegisterBroker(false)}
          onCreated={(id) => {
            setBrokerKey(`registered:${id}`);
            setShowRegisterBroker(false);
          }}
        />
      )}
    </>,
    document.body
  );
}
