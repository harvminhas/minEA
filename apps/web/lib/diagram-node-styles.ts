import { flowManualOwnerCaption, flowMechanismLabel } from "@/lib/flow-utils";
import type {
  ApiProperties,
  EventProperties,
  FlowMechanism,
  IntegrationFlowProperties,
  MinEAObject,
  ObjectType,
} from "@minea/types";
import { OBJECT_TYPE_LABELS } from "@minea/types";

/** Shared accent tokens for architecture diagram nodes. */
export type DiagramNodeAccent = {
  border: string;
  bg: string;
  text: string;
  /** React Flow handle / edge accent */
  handle: string;
  /** Top bar on center/hero nodes */
  bar: string;
};

export function diagramNodeAccent(type: ObjectType): DiagramNodeAccent {
  switch (type) {
    case "api":
      return {
        border: "border-teal-300",
        bg: "bg-teal-50",
        text: "text-teal-700",
        handle: "#14b8a6",
        bar: "#14b8a6",
      };
    case "event":
      return {
        border: "border-amber-300",
        bg: "bg-amber-50",
        text: "text-amber-700",
        handle: "#d97706",
        bar: "#f59e0b",
      };
    case "integration_flow":
      return {
        border: "border-slate-300",
        bg: "bg-slate-50",
        text: "text-slate-700",
        handle: "#64748b",
        bar: "#64748b",
      };
    case "application":
    case "solution":
    case "technical_capability":
      return {
        border: "border-indigo-300",
        bg: "bg-indigo-50",
        text: "text-indigo-700",
        handle: "#6366f1",
        bar: "#6366f1",
      };
    case "component":
      return {
        border: "border-violet-300",
        bg: "bg-violet-50",
        text: "text-violet-700",
        handle: "#8b5cf6",
        bar: "#8b5cf6",
      };
    case "data_object":
    case "data_store":
    case "data_domain":
      return {
        border: "border-amber-200",
        bg: "bg-amber-50",
        text: "text-amber-800",
        handle: "#d97706",
        bar: "#fbbf24",
      };
    case "cloud_service":
    case "model":
    case "tool":
    case "message_broker":
      return {
        border: "border-slate-300",
        bg: "bg-slate-50",
        text: "text-slate-700",
        handle: "#64748b",
        bar: "#64748b",
      };
    case "capability":
      return {
        border: "border-blue-300",
        bg: "bg-blue-50",
        text: "text-blue-700",
        handle: "#3b82f6",
        bar: "#3b82f6",
      };
    default:
      return {
        border: "border-gray-300",
        bg: "bg-gray-50",
        text: "text-gray-700",
        handle: "#94a3b8",
        bar: "#94a3b8",
      };
  }
}

export function diagramTypeLabel(type: ObjectType): string {
  return OBJECT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export type FlowDiagramNodeMeta = {
  name: string;
  mechanism?: FlowMechanism;
  mechanismLabel: string;
  ownerCaption?: string | null;
  carrierName?: string | null;
};

export function flowDiagramNodeMeta(flow: MinEAObject): FlowDiagramNodeMeta {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  return {
    name: flow.name,
    mechanism: props.mechanism,
    mechanismLabel: flowMechanismLabel(props),
    ownerCaption: flowManualOwnerCaption(flow),
    carrierName: props.carrier?.carrier_name?.trim() || null,
  };
}

export type EventDiagramNodeMeta = {
  name: string;
  topic: string;
  deliveryLabel?: string | null;
};

export function eventDiagramNodeMeta(event: MinEAObject, deliveryLabel?: string | null): EventDiagramNodeMeta {
  const props = (event.properties ?? {}) as EventProperties;
  return {
    name: event.name,
    topic: props.topic ?? event.name,
    deliveryLabel,
  };
}

export type ApiDiagramNodeMeta = {
  name: string;
  styleLabel: string;
  authLabel?: string | null;
};

export function apiDiagramNodeMeta(api: MinEAObject, styleLabel: string, authLabel?: string | null): ApiDiagramNodeMeta {
  return {
    name: api.name,
    styleLabel,
    authLabel,
  };
}
