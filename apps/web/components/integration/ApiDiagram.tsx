"use client";

import { memo, useMemo } from "react";
import { Handle, MarkerType, Position, type Edge, type Node, type NodeProps, type NodeTypes } from "reactflow";
import { Box, Braces, Layers, Server, X } from "lucide-react";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";
import {
  API_AUTH_LABEL,
  API_STYLE_LABEL,
  formatProviderLabel,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/api-utils";
import type { ApiProperties, MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

export type { NodeLayout };

function ProviderNode({ data, compact }: { data: { name: string; kind: string }; compact?: boolean }) {
  if (compact) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded px-1.5 py-1 min-w-[72px] max-w-[88px]">
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
        <p className="text-[8px] font-medium text-teal-800 truncate">{data.name}</p>
      </div>
    );
  }
  return (
    <div className="bg-white border-2 border-teal-300 rounded-lg shadow-sm min-w-[160px]">
      <Handle type="source" position={Position.Right} style={{ background: INTEGRATION_LAYER_COLOR }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-teal-50 flex items-center justify-center flex-shrink-0">
            {data.kind === "component" ? <Box size={11} className="text-teal-600" /> : <Layers size={11} className="text-teal-600" />}
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate">{data.name}</p>
        </div>
        <p className="text-[9px] text-teal-600 font-medium pl-7 mt-0.5 capitalize">Provider</p>
      </div>
    </div>
  );
}

function ApiCenterNode({ data, compact }: { data: { api: MinEAObject; props: ApiProperties }; compact?: boolean }) {
  const { api, props } = data;
  const style = API_STYLE_LABEL[props.protocol ?? ""] ?? props.protocol ?? "API";
  const auth = props.auth ? API_AUTH_LABEL[props.auth] ?? props.auth : null;

  if (compact) {
    return (
      <div className="bg-white border-2 border-gray-800 rounded-md overflow-hidden min-w-[68px] max-w-[80px]">
        <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
        <div className="h-1 bg-teal-500" />
        <p className="text-[8px] font-bold text-gray-900 px-1 py-1 truncate text-center">{style}</p>
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
            <Braces size={12} className="text-teal-600" />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{api.name}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium">
            {style}
            {props.version ? ` ${props.version}` : ""}
          </span>
          {auth && (
            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{auth}</span>
          )}
        </div>
        {props.audience && (
          <p className="text-[9px] text-gray-400 capitalize">Audience: {props.audience}</p>
        )}
      </div>
    </div>
  );
}

function ConsumerNode({ data, compact }: { data: { name: string; kind: string }; compact?: boolean }) {
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
        <p className="text-[9px] text-gray-400 capitalize mt-0.5">Consumer</p>
      </div>
    </div>
  );
}

function GatewayNode({ data, compact }: { data: { name: string }; compact?: boolean }) {
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
    <div className="bg-violet-50 border-2 border-violet-300 rounded-lg shadow-sm min-w-[130px]">
      <Handle type="source" position={Position.Bottom} style={{ background: "#8b5cf6" }} />
      <div className="px-3 py-2 flex items-center gap-2">
        <Server size={12} className="text-violet-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{data.name}</p>
          <p className="text-[9px] text-violet-600">Gateway</p>
        </div>
      </div>
    </div>
  );
}

const ProviderNodeFull = memo((props: NodeProps) => <ProviderNode data={props.data} />);
ProviderNodeFull.displayName = "ProviderNodeFull";
const ProviderNodeCompact = memo((props: NodeProps) => <ProviderNode data={props.data} compact />);
ProviderNodeCompact.displayName = "ProviderNodeCompact";
const ApiCenterNodeFull = memo((props: NodeProps) => <ApiCenterNode data={props.data} />);
ApiCenterNodeFull.displayName = "ApiCenterNodeFull";
const ApiCenterNodeCompact = memo((props: NodeProps) => <ApiCenterNode data={props.data} compact />);
ApiCenterNodeCompact.displayName = "ApiCenterNodeCompact";
const ConsumerNodeFull = memo((props: NodeProps) => <ConsumerNode data={props.data} />);
ConsumerNodeFull.displayName = "ConsumerNodeFull";
const ConsumerNodeCompact = memo((props: NodeProps) => <ConsumerNode data={props.data} compact />);
ConsumerNodeCompact.displayName = "ConsumerNodeCompact";
const GatewayNodeFull = memo((props: NodeProps) => <GatewayNode data={props.data} />);
GatewayNodeFull.displayName = "GatewayNodeFull";
const GatewayNodeCompact = memo((props: NodeProps) => <GatewayNode data={props.data} compact />);
GatewayNodeCompact.displayName = "GatewayNodeCompact";

export const API_NODE_TYPES: NodeTypes = {
  apiProviderNode: ProviderNodeFull,
  apiCenterNode: ApiCenterNodeFull,
  apiConsumerNode: ConsumerNodeFull,
  apiGatewayNode: GatewayNodeFull,
};

export const API_NODE_TYPES_COMPACT: NodeTypes = {
  apiProviderNode: ProviderNodeCompact,
  apiCenterNode: ApiCenterNodeCompact,
  apiConsumerNode: ConsumerNodeCompact,
  apiGatewayNode: GatewayNodeCompact,
};

export function buildApiGraph(
  api: MinEAObject,
  compact?: boolean,
  savedLayout?: NodeLayout
): { nodes: Node[]; edges: Edge[] } {
  const props = (api.properties ?? {}) as ApiProperties;
  const provider = props.provider;
  const consumers = props.consumers ?? [];
  const gateway = props.gateway;

  const NODE_H = compact ? 36 : 72;
  const GAP = compact ? 12 : 24;
  const PROVIDER_X = compact ? 8 : 0;
  const CENTER_X = compact ? 120 : 280;
  const CONSUMER_X = compact ? 240 : 540;
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

  const providerType = compact ? "apiProviderNode" : "apiProviderNode";
  const centerType = "apiCenterNode";
  const consumerType = "apiConsumerNode";
  const gatewayType = "apiGatewayNode";

  if (provider) {
    nodes.push({
      id: "provider",
      type: providerType,
      position: pos("provider", { x: PROVIDER_X, y: CENTER_Y }),
      data: {
        name: formatProviderLabel(provider),
        kind: provider.provider_kind,
      },
    });
  }

  nodes.push({
    id: "api-center",
    type: centerType,
    position: pos("api-center", { x: CENTER_X, y: CENTER_Y }),
    data: { api, props },
  });

  if (gateway) {
    nodes.push({
      id: "gateway",
      type: gatewayType,
      position: pos("gateway", { x: CENTER_X, y: CENTER_Y - (compact ? 48 : 120) }),
      data: { name: gateway.gateway_name },
    });
    edges.push({
      id: "e-gateway-api",
      source: "gateway",
      target: "api-center",
      type: "smoothstep",
      style: { stroke: "#8b5cf6", strokeWidth: compact ? 1 : 1.5, strokeDasharray: compact ? "3 2" : "4 3" },
      markerEnd: compact ? undefined : { type: MarkerType.ArrowClosed, color: "#8b5cf6", width: 12, height: 12 },
    });
  }

  if (provider) {
    edges.push({
      id: "e-provider-api",
      source: "provider",
      target: gateway ? "gateway" : "api-center",
      type: "smoothstep",
      animated: !compact,
      style: edgeStyle,
      markerEnd: gateway ? undefined : marker,
    });
  }

  const consumerPos = autoY(Math.max(consumers.length, 1), CONSUMER_X);
  if (consumers.length === 0) {
    nodes.push({
      id: "consumer-placeholder",
      type: "default",
      position: pos("consumer-placeholder", consumerPos[0]!),
      data: { label: compact ? "—" : "No consumers" },
      style: { opacity: 0.35, fontSize: compact ? 8 : 11, width: compact ? 60 : 120 },
    });
  } else {
    consumers.forEach((c, i) => {
      const id = `consumer-${c.consumer_id ?? c.consumer_name}`;
      nodes.push({
        id,
        type: consumerType,
        position: pos(id, consumerPos[i]!),
        data: { name: c.consumer_name, kind: c.consumer_kind },
      });
      edges.push({
        id: `e-${id}`,
        source: "api-center",
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
  api: MinEAObject;
  className?: string;
  compact?: boolean;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
}

export function ApiArchitectureGraph({
  api,
  className,
  compact,
  onLayoutSave,
  onResetLayout,
}: ArchitectureProps) {
  const props = (api.properties ?? {}) as ApiProperties;
  const savedLayout = props.node_layout;
  const hasCustomLayout = !!(savedLayout && Object.keys(savedLayout).length > 0);

  const { nodes, edges } = useMemo(
    () => buildApiGraph(api, compact, compact ? undefined : savedLayout),
    [api, compact, savedLayout]
  );

  return (
    <div className={cn("relative overflow-hidden", compact ? "h-[160px]" : "h-full", className)}>
      <EntityFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={compact ? API_NODE_TYPES_COMPACT : API_NODE_TYPES}
        mode={compact ? "thumbnail" : "full"}
        accentColor={INTEGRATION_LAYER_COLOR}
        fitViewPadding={compact ? 0.08 : 0.2}
        onLayoutSave={compact ? undefined : onLayoutSave}
        onResetLayout={compact ? undefined : onResetLayout}
        hasCustomLayout={hasCustomLayout}
        emptyLabel="Select a provider to preview the API architecture"
        className={cn("h-full rounded-lg border border-gray-200", compact && "rounded-none border-0")}
      />
    </div>
  );
}

export function ApiDiagramModal({
  api,
  onClose,
  onLayoutSave,
  onResetLayout,
}: {
  api: MinEAObject;
  onClose: () => void;
  onLayoutSave?: (layout: NodeLayout) => void;
  onResetLayout?: () => void;
}) {
  const props = (api.properties ?? {}) as ApiProperties;
  const styleLabel = API_STYLE_LABEL[props.protocol ?? ""] ?? props.protocol;
  const consumerCount = props.consumers?.length ?? 0;

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={onClose} />
      <div className="fixed inset-6 z-[210] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-0.5">
              API architecture
            </p>
            <h2 className="text-base font-bold text-gray-900">{api.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {props.provider && (
                <span className="text-xs text-gray-500">
                  Provider: {formatProviderLabel(props.provider)}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {consumerCount} consumer{consumerCount !== 1 ? "s" : ""}
              </span>
              {styleLabel && (
                <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium">
                  {styleLabel}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 relative min-h-0">
          <ApiArchitectureGraph
            api={api}
            onLayoutSave={onLayoutSave}
            onResetLayout={onResetLayout}
          />
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 flex-shrink-0 flex-wrap">
          {props.gateway && (
            <span className="text-xs text-gray-500">Gateway: {props.gateway.gateway_name}</span>
          )}
          {props.base_url && <span className="text-xs text-gray-500 font-mono truncate">{props.base_url}</span>}
          {api.owner && <span className="text-xs text-gray-500 ml-auto">Owner: {api.owner}</span>}
        </div>
      </div>
    </>
  );
}
