"use client";

import {
  Box,
  Braces,
  Clock,
  Cpu,
  Database,
  FileText,
  Layers,
  Link2,
  Plug,
  Puzzle,
  Server,
  Target,
  User,
  Zap,
} from "lucide-react";
import { Handle, Position } from "reactflow";
import {
  diagramNodeAccent,
  diagramTypeLabel,
  type ApiDiagramNodeMeta,
  type EventDiagramNodeMeta,
  type FlowDiagramNodeMeta,
} from "@/lib/diagram-node-styles";
import type { FlowMechanism, ObjectType } from "@minea/types";
import { cn } from "@/lib/utils";

export function FlowMechanismIcon({
  mechanism,
  size = 11,
  className,
}: {
  mechanism?: FlowMechanism;
  size?: number;
  className?: string;
}) {
  const cls = cn("text-slate-600", className);
  switch (mechanism) {
    case "api_realtime":
      return <Plug size={size} className={cls} />;
    case "event_driven":
      return <Zap size={size} className={cls} />;
    case "batch_scheduled":
      return <Clock size={size} className={cls} />;
    case "no_code_ipaas":
      return <Puzzle size={size} className={cls} />;
    case "manual":
      return <User size={size} className={cls} />;
    case "file_based":
      return <FileText size={size} className={cls} />;
    default:
      return <Link2 size={size} className={cls} />;
  }
}

export function DiagramTypeIcon({
  type,
  size = 11,
  flowMechanism,
}: {
  type: ObjectType;
  size?: number;
  flowMechanism?: FlowMechanism;
}) {
  if (type === "integration_flow") {
    return <FlowMechanismIcon mechanism={flowMechanism} size={size} />;
  }

  const accent = diagramNodeAccent(type);
  const iconClass = accent.text;
  switch (type) {
    case "api":
      return <Braces size={size} className={iconClass} />;
    case "event":
      return <Zap size={size} className="text-amber-600" />;
    case "application":
    case "solution":
    case "technical_capability":
      return <Layers size={size} className="text-indigo-600" />;
    case "component":
      return <Box size={size} className="text-violet-600" />;
    case "data_object":
    case "data_store":
    case "data_domain":
      return <Database size={size} className="text-amber-700" />;
    case "cloud_service":
      return <Server size={size} className="text-slate-600" />;
    case "model":
    case "tool":
    case "message_broker":
      return <Cpu size={size} className="text-slate-600" />;
    case "capability":
      return <Target size={size} className="text-blue-600" />;
    default:
      return <Link2 size={size} className="text-gray-500" />;
  }
}

type HandleSide = "left" | "right" | "top" | "bottom";

function DiagramHandles({
  compact,
  handleColor,
  targets = [],
  sources = [],
}: {
  compact?: boolean;
  handleColor: string;
  targets?: HandleSide[];
  sources?: HandleSide[];
}) {
  const hidden = compact ? "!opacity-0 !w-1 !h-1" : undefined;
  const style = compact ? undefined : { background: handleColor };

  return (
    <>
      {targets.includes("left") && (
        <Handle type="target" position={Position.Left} id="left" className={hidden} style={style} />
      )}
      {targets.includes("right") && (
        <Handle type="target" position={Position.Right} id="right" className={hidden} style={style} />
      )}
      {targets.includes("top") && (
        <Handle type="target" position={Position.Top} id="top" className={hidden} style={style} />
      )}
      {sources.includes("left") && (
        <Handle type="source" position={Position.Left} id="left" className={hidden} style={style} />
      )}
      {sources.includes("right") && (
        <Handle type="source" position={Position.Right} id="right" className={hidden} style={style} />
      )}
      {sources.includes("bottom") && (
        <Handle type="source" position={Position.Bottom} id="bottom" className={hidden} style={style} />
      )}
    </>
  );
}

/** Standard linked-object node (API, Event, System peer, etc.) */
export function DiagramLinkedObjectNode({
  name,
  objectType,
  compact,
  roleLabel,
  subtitle,
  handleColor,
  targetHandles = ["left"],
  sourceHandles = ["right"],
}: {
  name: string;
  objectType: ObjectType;
  compact?: boolean;
  roleLabel?: string;
  subtitle?: string;
  handleColor?: string;
  targetHandles?: HandleSide[];
  sourceHandles?: HandleSide[];
}) {
  const accent = diagramNodeAccent(objectType);
  const typeLabel = roleLabel ?? diagramTypeLabel(objectType);
  const handles = handleColor ?? accent.handle;

  if (compact) {
    return (
      <div className={cn("rounded px-1.5 py-1 min-w-[68px] max-w-[84px] border", accent.bg, accent.border)}>
        <DiagramHandles compact handleColor={handles} targets={targetHandles} sources={sourceHandles} />
        <p className={cn("text-[8px] font-medium truncate", accent.text)}>{name}</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg shadow-sm min-w-[150px] border-2 bg-white", accent.border)}>
      <DiagramHandles
        handleColor={handles}
        targets={targetHandles}
        sources={sourceHandles}
      />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={cn("h-5 w-5 rounded flex items-center justify-center flex-shrink-0", accent.bg)}>
            <DiagramTypeIcon type={objectType} />
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate">{name}</p>
        </div>
        <p className={cn("text-[9px] font-medium pl-7 mt-0.5", accent.text)}>{typeLabel}</p>
        {subtitle && <p className="text-[9px] text-gray-400 pl-7 mt-0.5 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Standard flow node — same content in system relationship map and flow detail diagram. */
export function DiagramFlowNode({
  meta,
  compact,
  variant = "linked",
  targetHandles = ["left"],
  sourceHandles = ["right"],
}: {
  meta: FlowDiagramNodeMeta;
  compact?: boolean;
  variant?: "linked" | "center";
  targetHandles?: HandleSide[];
  sourceHandles?: HandleSide[];
}) {
  const accent = diagramNodeAccent("integration_flow");

  if (compact) {
    return (
      <div className={cn("rounded px-1.5 py-1 min-w-[68px] max-w-[84px] border", accent.bg, accent.border)}>
        <DiagramHandles
          compact
          handleColor={accent.handle}
          targets={targetHandles}
          sources={sourceHandles}
        />
        <p className={cn("text-[8px] font-medium truncate", accent.text)}>{meta.name}</p>
      </div>
    );
  }

  const isCenter = variant === "center";

  return (
    <div
      className={cn(
        "bg-white overflow-hidden border-2",
        accent.border,
        isCenter ? "rounded-xl shadow-xl w-[220px]" : "rounded-lg shadow-sm min-w-[150px]"
      )}
    >
      <DiagramHandles
        handleColor={accent.handle}
        targets={targetHandles}
        sources={sourceHandles}
      />
      {isCenter && <div className="h-1" style={{ backgroundColor: accent.bar }} />}
      <div className={cn(isCenter ? "px-4 py-3 space-y-1.5" : "px-3 py-2.5")}>
        <div className="flex items-center gap-2">
          <div className={cn("rounded flex items-center justify-center flex-shrink-0", accent.bg, isCenter ? "h-6 w-6" : "h-5 w-5")}>
            <FlowMechanismIcon mechanism={meta.mechanism} size={isCenter ? 12 : 11} />
          </div>
          <p className={cn("font-semibold text-gray-900 truncate", isCenter ? "text-sm font-bold" : "text-xs")}>
            {meta.name}
          </p>
        </div>
        <p className={cn("font-medium pl-7", accent.text, isCenter ? "text-[10px]" : "text-[9px] mt-0.5")}>
          Flow · {meta.mechanismLabel}
        </p>
        {meta.ownerCaption && (
          <p className="text-[9px] text-slate-500 pl-7 truncate italic">{meta.ownerCaption}</p>
        )}
        {meta.carrierName && (
          <p className="text-[9px] text-gray-400 pl-7 truncate">via {meta.carrierName}</p>
        )}
      </div>
    </div>
  );
}

/** Standard event center node — same accent/content across event detail and linked diagrams. */
export function DiagramEventCenterNode({
  meta,
  compact,
  targetHandles = ["left"],
  sourceHandles = ["right"],
}: {
  meta: EventDiagramNodeMeta;
  compact?: boolean;
  targetHandles?: HandleSide[];
  sourceHandles?: HandleSide[];
}) {
  const accent = diagramNodeAccent("event");

  if (compact) {
    return (
      <div className={cn("bg-white border-2 rounded-md overflow-hidden min-w-[68px] max-w-[80px]", accent.border)}>
        <DiagramHandles
          compact
          handleColor={accent.handle}
          targets={targetHandles}
          sources={sourceHandles}
        />
        <div className="h-1" style={{ backgroundColor: accent.bar }} />
        <p className={cn("text-[8px] font-bold px-1 py-1 truncate text-center", accent.text)}>{meta.name}</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-xl shadow-xl border-2 overflow-hidden w-[220px]", accent.border)}>
      <DiagramHandles
        handleColor={accent.handle}
        targets={targetHandles}
        sources={sourceHandles}
      />
      <div className="h-1" style={{ backgroundColor: accent.bar }} />
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className={cn("h-6 w-6 rounded flex items-center justify-center flex-shrink-0", accent.bg)}>
            <DiagramTypeIcon type="event" size={12} />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{meta.name}</p>
        </div>
        <p className={cn("text-[10px] font-medium pl-7 truncate font-mono", accent.text)}>
          Event · {meta.topic}
        </p>
        {meta.deliveryLabel && (
          <p className="text-[9px] text-gray-400 pl-7">{meta.deliveryLabel}</p>
        )}
      </div>
    </div>
  );
}

/** Standard API center node — same accent/content across API detail and linked diagrams. */
export function DiagramApiCenterNode({
  meta,
  compact,
  targetHandles = ["left", "right", "top"],
  sourceHandles = [],
}: {
  meta: ApiDiagramNodeMeta;
  compact?: boolean;
  targetHandles?: HandleSide[];
  sourceHandles?: HandleSide[];
}) {
  const accent = diagramNodeAccent("api");

  if (compact) {
    return (
      <div className={cn("bg-white border-2 rounded-md overflow-hidden min-w-[68px] max-w-[80px]", accent.border)}>
        <DiagramHandles
          compact
          handleColor={accent.handle}
          targets={targetHandles}
          sources={sourceHandles}
        />
        <div className="h-1" style={{ backgroundColor: accent.bar }} />
        <p className={cn("text-[8px] font-bold px-1 py-1 truncate text-center", accent.text)}>{meta.styleLabel}</p>
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-xl shadow-xl border-2 overflow-hidden w-[220px]", accent.border)}>
      <DiagramHandles
        handleColor={accent.handle}
        targets={targetHandles}
        sources={sourceHandles}
      />
      <div className="h-1" style={{ backgroundColor: accent.bar }} />
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className={cn("h-6 w-6 rounded flex items-center justify-center flex-shrink-0", accent.bg)}>
            <DiagramTypeIcon type="api" size={12} />
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{meta.name}</p>
        </div>
        <p className={cn("text-[10px] font-medium pl-7", accent.text)}>API · {meta.styleLabel}</p>
        {meta.authLabel && (
          <p className="text-[9px] text-gray-400 pl-7">{meta.authLabel}</p>
        )}
      </div>
    </div>
  );
}

/** Endpoint in flow/API/event architecture diagrams (producer, consumer, from/to). */
export function DiagramEndpointNode({
  name,
  objectType,
  roleLabel,
  subtitle,
  compact,
  side,
}: {
  name: string;
  objectType: ObjectType;
  roleLabel: string;
  subtitle?: string;
  compact?: boolean;
  side: "source" | "dest";
}) {
  return (
    <DiagramLinkedObjectNode
      name={name}
      objectType={objectType}
      compact={compact}
      roleLabel={roleLabel}
      subtitle={subtitle}
      targetHandles={side === "dest" ? ["left"] : []}
      sourceHandles={side === "source" ? ["right"] : []}
    />
  );
}
