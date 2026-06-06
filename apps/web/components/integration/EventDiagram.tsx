"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Handle, MarkerType, Position, type Edge, type Node, type NodeProps, type NodeTypes } from "reactflow";
import { Box, Database, Layers, Plus, Radio, X, Zap } from "lucide-react";
import { AddSubscriberDialog } from "@/components/integration/AddSubscriberDialog";
import { PickProducerDialog } from "@/components/integration/PickProducerDialog";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { EventArchitectureUpdate } from "@/lib/event-relationship-utils";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { toast } from "@/hooks/use-toast";
import {
  eventBrokerCarrierOptions,
  formatCarrierOptionLabel,
  infraCarrierFieldHint,
  integrationInfraToolsQueryKey,
} from "@/lib/integration-infra-carriers";
import {
  brokerKeyFromRef,
  brokerRefFromKey,
  normalizeEventBrokerRef,
  EVENT_DELIVERY_LABEL,
  formatProducerLabel,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/event-utils";
import type {
  EventBrokerRef,
  EventProducerRef,
  EventProperties,
  EventSubscriberRef,
  MinEAObject,
} from "@minea/types";
import { cn } from "@/lib/utils";

export type { NodeLayout };

function ProducerNode({ data, compact }: { data: { name: string; kind: string }; compact?: boolean }) {
  if (compact) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded px-1.5 py-1 min-w-[72px] max-w-[88px]">
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
        <p className="text-[8px] font-medium text-teal-800 truncate">{data.name}</p>
      </div>
    );
  }
  const Icon = data.kind === "component" ? Box : data.kind === "data_object" ? Database : Layers;
  return (
    <div className="bg-white border-2 border-teal-300 rounded-lg shadow-sm min-w-[160px]">
      <Handle type="source" position={Position.Right} style={{ background: INTEGRATION_LAYER_COLOR }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-teal-50 flex items-center justify-center flex-shrink-0">
            <Icon size={11} className="text-teal-600" />
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate">{data.name}</p>
        </div>
        <p className="text-[9px] text-teal-600 font-medium pl-7 mt-0.5">Producer</p>
      </div>
    </div>
  );
}

function EventCenterNode({ data, compact }: { data: { event: MinEAObject; props: EventProperties }; compact?: boolean }) {
  const { event, props } = data;
  const topic = props.topic ?? event.name;
  const delivery = props.delivery ? EVENT_DELIVERY_LABEL[props.delivery] ?? props.delivery : null;

  if (compact) {
    return (
      <div className="bg-white border-2 border-gray-800 rounded-md overflow-hidden min-w-[68px] max-w-[80px]">
        <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
        <div className="h-1 bg-teal-500" />
        <p className="text-[8px] font-bold text-gray-900 px-1 py-1 truncate text-center">{topic}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl border-2 border-gray-800 overflow-hidden w-[220px]">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="h-1 bg-teal-500" />
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-teal-50 flex items-center justify-center flex-shrink-0">
            <Zap size={12} className="text-teal-600" />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{event.name}</p>
        </div>
        <span className="inline-block text-[10px] bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium font-mono">
          {topic}
          {props.version ? ` · ${props.version}` : ""}
        </span>
        {delivery && <p className="text-[9px] text-gray-400">{delivery}</p>}
      </div>
    </div>
  );
}

function SubscriberNode({ data, compact }: { data: { name: string; kind: string }; compact?: boolean }) {
  const isPartner = data.kind === "custom" && data.name.toLowerCase().includes("partner");
  if (compact) {
    return (
      <div
        className={cn(
          "rounded px-1.5 py-1 min-w-[72px] max-w-[88px] border",
          isPartner ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
        )}
      >
        <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
        <p className="text-[8px] font-medium text-gray-700 truncate">{data.name}</p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-lg shadow-sm min-w-[140px] border-2",
        isPartner ? "bg-amber-50 border-amber-300" : "bg-white border-gray-300"
      )}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#94a3b8" }} />
      <div className="px-3 py-2">
        <p className="text-xs font-medium text-gray-800 truncate">{data.name}</p>
        <p className="text-[9px] text-gray-400 mt-0.5">Subscriber</p>
      </div>
    </div>
  );
}

function BrokerNode({ data, compact }: { data: { name: string }; compact?: boolean }) {
  if (compact) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 min-w-[56px]">
        <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
        <p className="text-[7px] text-violet-700 truncate text-center">{data.name}</p>
      </div>
    );
  }
  return (
    <div className="bg-violet-50 border-2 border-violet-300 rounded-lg shadow-sm min-w-[140px]">
      <Handle type="target" position={Position.Left} style={{ background: "#8b5cf6" }} />
      <Handle type="source" position={Position.Right} style={{ background: "#8b5cf6" }} />
      <div className="px-3 py-2 flex items-center gap-2">
        <Radio size={12} className="text-violet-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{data.name}</p>
          <p className="text-[9px] text-violet-600">Broker</p>
        </div>
      </div>
    </div>
  );
}

const ProducerNodeFull = memo((props: NodeProps) => <ProducerNode data={props.data} />);
ProducerNodeFull.displayName = "ProducerNodeFull";
const ProducerNodeCompact = memo((props: NodeProps) => <ProducerNode data={props.data} compact />);
ProducerNodeCompact.displayName = "ProducerNodeCompact";
const EventCenterNodeFull = memo((props: NodeProps) => <EventCenterNode data={props.data} />);
EventCenterNodeFull.displayName = "EventCenterNodeFull";
const EventCenterNodeCompact = memo((props: NodeProps) => <EventCenterNode data={props.data} compact />);
EventCenterNodeCompact.displayName = "EventCenterNodeCompact";
const SubscriberNodeFull = memo((props: NodeProps) => <SubscriberNode data={props.data} />);
SubscriberNodeFull.displayName = "SubscriberNodeFull";
const SubscriberNodeCompact = memo((props: NodeProps) => <SubscriberNode data={props.data} compact />);
SubscriberNodeCompact.displayName = "SubscriberNodeCompact";
const BrokerNodeFull = memo((props: NodeProps) => <BrokerNode data={props.data} />);
BrokerNodeFull.displayName = "BrokerNodeFull";
const BrokerNodeCompact = memo((props: NodeProps) => <BrokerNode data={props.data} compact />);
BrokerNodeCompact.displayName = "BrokerNodeCompact";

export const EVENT_NODE_TYPES: NodeTypes = {
  eventProducerNode: ProducerNodeFull,
  eventCenterNode: EventCenterNodeFull,
  eventSubscriberNode: SubscriberNodeFull,
  eventBrokerNode: BrokerNodeFull,
};

export const EVENT_NODE_TYPES_COMPACT: NodeTypes = {
  eventProducerNode: ProducerNodeCompact,
  eventCenterNode: EventCenterNodeCompact,
  eventSubscriberNode: SubscriberNodeCompact,
  eventBrokerNode: BrokerNodeCompact,
};

export function buildEventGraph(
  event: MinEAObject,
  compact?: boolean,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const props = (event.properties ?? {}) as EventProperties;
  const producer = props.producer;
  const subscribers = props.subscribers ?? [];
  const broker = props.broker;

  const NODE_H = compact ? 36 : 72;
  const GAP = compact ? 12 : 24;
  const PRODUCER_X = compact ? 8 : 0;
  const BROKER_X = compact ? 80 : 140;
  const CENTER_X = compact ? 160 : 320;
  const SUBSCRIBER_X = compact ? 250 : 560;
  const CENTER_Y = compact ? 40 : -50;

  function autoY(count: number, x: number) {
    const total = Math.max(count, 1) * NODE_H + Math.max(count - 1, 0) * GAP;
    const start = -total / 2;
    return Array.from({ length: Math.max(count, 1) }, (_, i) => ({ x, y: start + i * (NODE_H + GAP) }));
  }

  function pos(id: string, auto: { x: number; y: number }) {
    if (compact) return auto;
    return savedLayout?.[id] ?? auto;
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeStyle = { stroke: INTEGRATION_LAYER_COLOR, strokeWidth: compact ? 1 : 1.5 };
  const marker = compact
    ? undefined
    : { type: MarkerType.ArrowClosed, color: INTEGRATION_LAYER_COLOR, width: 14, height: 14 };

  if (producer) {
    nodes.push({
      id: "producer",
      type: "eventProducerNode",
      position: pos("producer", { x: PRODUCER_X, y: CENTER_Y }),
      data: { name: formatProducerLabel(producer), kind: producer.producer_kind },
    });
  }

  if (broker) {
    nodes.push({
      id: "broker",
      type: "eventBrokerNode",
      position: pos("broker", { x: BROKER_X, y: CENTER_Y }),
      data: { name: broker.broker_name },
    });
  }

  nodes.push({
    id: "event-center",
    type: "eventCenterNode",
    position: pos("event-center", { x: CENTER_X, y: CENTER_Y }),
    data: { event, props },
  });

  if (producer) {
    edges.push({
      id: "e-producer-broker",
      source: "producer",
      target: broker ? "broker" : "event-center",
      type: "smoothstep",
      animated: !compact,
      style: edgeStyle,
      markerEnd: broker ? undefined : marker,
    });
  }

  if (broker) {
    edges.push({
      id: "e-broker-event",
      source: "broker",
      target: "event-center",
      type: "smoothstep",
      animated: !compact,
      style: { stroke: "#8b5cf6", strokeWidth: compact ? 1 : 1.5 },
      markerEnd: marker,
    });
  }

  const subPos = autoY(Math.max(subscribers.length, 1), SUBSCRIBER_X);
  if (subscribers.length === 0) {
    nodes.push({
      id: "sub-placeholder",
      type: "default",
      position: pos("sub-placeholder", subPos[0]!),
      data: { label: compact ? "—" : "No subscribers" },
      style: { opacity: 0.35, fontSize: compact ? 8 : 11, width: compact ? 60 : 120 },
    });
  } else {
    subscribers.forEach((s, i) => {
      const id = `sub-${s.subscriber_id ?? s.subscriber_name}`;
      nodes.push({
        id,
        type: "eventSubscriberNode",
        position: pos(id, subPos[i]!),
        data: { name: s.subscriber_name, kind: s.subscriber_kind },
      });
      edges.push({
        id: `e-${id}`,
        source: "event-center",
        target: id,
        type: "smoothstep",
        animated: !compact,
        style: edgeStyle,
        markerEnd: marker,
      });
    });
  }

  return { nodes, edges };
}

interface ArchitectureProps {
  event: MinEAObject;
  className?: string;
  compact?: boolean;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  exportFilename?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function EventArchitectureGraph({
  event,
  className,
  compact,
  onLayoutSave,
  onResetLayout,
  exportFilename,
  containerRef,
}: ArchitectureProps) {
  const props = (event.properties ?? {}) as EventProperties;
  const savedLayout = props.node_layout;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);

  const { nodes, edges } = useMemo(
    () => buildEventGraph(event, compact, compact ? undefined : savedLayout),
    [event, compact, savedLayout]
  );

  return (
    <div className={cn("relative overflow-hidden", compact ? "h-[160px]" : "h-full", className)}>
      <EntityFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={compact ? EVENT_NODE_TYPES_COMPACT : EVENT_NODE_TYPES}
        mode={compact ? "thumbnail" : "full"}
        accentColor={INTEGRATION_LAYER_COLOR}
        fitViewPadding={compact ? 0.08 : 0.2}
        onLayoutSave={compact ? undefined : onLayoutSave}
        onResetLayout={compact ? undefined : onResetLayout}
        hasCustomLayout={hasCustomLayout}
        exportFilename={compact ? undefined : exportFilename}
        containerRef={containerRef}
        emptyLabel="Select a producer to preview the event architecture"
        className={cn("h-full rounded-lg border border-gray-200", compact && "rounded-none border-0")}
      />
    </div>
  );
}

function EditBrokerDialog({
  brokerKey,
  currentBroker,
  registeredBrokers,
  onClose,
  onApply,
  onRegister,
}: {
  brokerKey: string;
  currentBroker?: EventBrokerRef | null;
  registeredBrokers: Array<{
    id: string;
    name: string;
    transport?: string;
    object_type?: "tool" | "message_broker";
  }>;
  onClose: () => void;
  onApply: (broker: EventBrokerRef | null) => void;
  onRegister?: () => void;
}) {
  const [key, setKey] = useState(brokerKey);

  return (
    <>
      <div className="fixed inset-0 z-[220] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[230] w-full max-w-md bg-white rounded-xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Broker / transport</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">None</option>
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
        {(() => {
          const hint = infraCarrierFieldHint("events", registeredBrokers.length > 0);
          return (
            <p
              className={cn(
                "text-[11px] mt-2",
                hint.tone === "notice" ? "text-amber-700" : "text-gray-400"
              )}
            >
              {hint.text}
            </p>
          );
        })()}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const ref = brokerRefFromKey(key, registeredBrokers);
              if (ref) {
                onApply(ref);
                return;
              }
              if (key.startsWith("registered:") && currentBroker?.broker_id === key.slice(11)) {
                onApply(normalizeEventBrokerRef(currentBroker));
                return;
              }
              if (!key) onApply(null);
            }}
            className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

export function EventDiagramModal({
  event,
  onClose,
  onLayoutSave,
  onResetLayout,
  onArchitectureChange,
}: {
  event: MinEAObject;
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
  onArchitectureChange?: (
    updates: EventArchitectureUpdate
  ) => void | Promise<MinEAObject | void>;
}) {
  const [liveEvent, setLiveEvent] = useState(event);
  const [showProducerDialog, setShowProducerDialog] = useState(false);
  const [showSubscriberDialog, setShowSubscriberDialog] = useState(false);
  const [showBrokerDialog, setShowBrokerDialog] = useState(false);
  const [savingArch, setSavingArch] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

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

  useEffect(() => {
    setLiveEvent(event);
  }, [event]);

  const props = (liveEvent.properties ?? {}) as EventProperties;
  const subscribers = props.subscribers ?? [];
  const editable = !!onArchitectureChange;
  const hasCustomLayout = !!(props.node_layout && Object.keys(props.node_layout).length > 0);

  const applyArchitecture = async (updates: EventArchitectureUpdate) => {
    if (!onArchitectureChange) return;
    setSavingArch(true);
    try {
      const result = await onArchitectureChange(updates);
      if (result) {
        setLiveEvent(result);
      } else {
        const currentProps = (liveEvent.properties ?? {}) as EventProperties;
        setLiveEvent({
          ...liveEvent,
          properties: {
            ...currentProps,
            ...(updates.producer !== undefined ? { producer: updates.producer ?? undefined } : {}),
            ...(updates.subscribers !== undefined ? { subscribers: updates.subscribers } : {}),
            ...(updates.broker !== undefined ? { broker: updates.broker ?? undefined } : {}),
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save architecture changes.";
      toast({ title: "Failed to save", description: message, variant: "destructive" });
    } finally {
      setSavingArch(false);
    }
  };

  const handleProducerApply = (producer: EventProducerRef | null) => {
    setShowProducerDialog(false);
    void applyArchitecture({ producer });
  };

  const handleSubscribersApply = (nextSubscribers: EventSubscriberRef[]) => {
    setShowSubscriberDialog(false);
    void applyArchitecture({ subscribers: nextSubscribers });
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={onClose} />
      <div className="fixed inset-6 z-[210] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <DiagramSavingBar active={savingArch} />
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-0.5">
              Event architecture
            </p>
            <h2 className="text-base font-bold text-gray-900">{liveEvent.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {props.producer && (
                <span className="text-xs text-gray-500">
                  Producer: {formatProducerLabel(props.producer)}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {subscribers.length} subscriber{subscribers.length !== 1 ? "s" : ""}
              </span>
              {props.topic && (
                <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium font-mono">
                  {props.topic}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editable && (
              <>
                <button
                  type="button"
                  onClick={() => setShowProducerDialog(true)}
                  disabled={savingArch}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {props.producer ? "Change producer" : "Add producer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubscriberDialog(true)}
                  disabled={savingArch}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {subscribers.length > 0 ? "Edit subscribers" : "Add subscribers"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBrokerDialog(true)}
                  disabled={savingArch}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Plus size={12} />
                  {props.broker ? "Edit broker" : "Add broker"}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={canvasRef} className="flex-1 relative min-h-0">
          <EventArchitectureGraph
            event={liveEvent}
            onLayoutSave={onLayoutSave}
            onResetLayout={onResetLayout}
            exportFilename={liveEvent.name}
            containerRef={canvasRef}
          />
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 flex-shrink-0 flex-wrap">
          {props.broker && <span className="text-xs text-gray-500">Broker: {props.broker.broker_name}</span>}
          {props.delivery && (
            <span className="text-xs text-gray-500">
              {EVENT_DELIVERY_LABEL[props.delivery] ?? props.delivery}
            </span>
          )}
          {hasCustomLayout && <span className="text-[10px] text-teal-600 font-medium">Layout saved ✓</span>}
          {liveEvent.owner && <span className="text-xs text-gray-500 ml-auto">Owner: {liveEvent.owner}</span>}
        </div>
      </div>

      {showProducerDialog && (
        <PickProducerDialog
          selected={props.producer ?? null}
          onClose={() => setShowProducerDialog(false)}
          onApply={handleProducerApply}
        />
      )}

      {showSubscriberDialog && (
        <AddSubscriberDialog
          selected={subscribers}
          onClose={() => setShowSubscriberDialog(false)}
          onApply={handleSubscribersApply}
        />
      )}

      {showBrokerDialog && (
        <EditBrokerDialog
          brokerKey={brokerKeyFromRef(props.broker ?? null)}
          currentBroker={props.broker ?? null}
          registeredBrokers={registeredBrokers}
          onClose={() => setShowBrokerDialog(false)}
          onApply={(broker) => {
            setShowBrokerDialog(false);
            void applyArchitecture({ broker });
          }}
        />
      )}
    </>
  );
}
