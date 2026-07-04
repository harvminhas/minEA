import type { FlowEndpointKind, IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { flowProps } from "@/lib/flow-list-utils";
import { flowFromLine, flowToLine, isFlowSystemEndpointKind } from "@/lib/flow-utils";

export function flowUsesEntity(flow: MinEAObject, entityId: string): boolean {
  const props = flowProps(flow);
  return (
    (props.from?.endpoint_kind === "data_object" && props.from.endpoint_id === entityId) ||
    (props.to?.endpoint_kind === "data_object" && props.to.endpoint_id === entityId)
  );
}

export function flowInvolvesSystem(flow: MinEAObject, systemId: string): boolean {
  const props = flowProps(flow);
  if (props.from?.endpoint_id === systemId && isFlowSystemEndpointKind(props.from.endpoint_kind)) {
    return true;
  }
  if (props.to?.endpoint_id === systemId && isFlowSystemEndpointKind(props.to.endpoint_kind)) {
    return true;
  }
  return false;
}

export function flowHasDataEntityEndpoint(flow: MinEAObject): boolean {
  const props = flowProps(flow);
  return (
    props.from?.endpoint_kind === "data_object" || props.to?.endpoint_kind === "data_object"
  );
}

export function flowIsSystemToSystem(flow: MinEAObject): boolean {
  const props = flowProps(flow);
  if (!props.from || !props.to) return false;
  return (
    isFlowSystemEndpointKind(props.from.endpoint_kind) &&
    isFlowSystemEndpointKind(props.to.endpoint_kind)
  );
}

export function flowsForSystemDataTab(
  systemId: string,
  linkedEntityIds: string[],
  flows: MinEAObject[]
): MinEAObject[] {
  return flows.filter((flow) => {
    if (!flowHasDataEntityEndpoint(flow)) return false;
    if (flowInvolvesSystem(flow, systemId)) return true;
    return linkedEntityIds.some((id) => flowUsesEntity(flow, id));
  });
}

export function flowsForSystemObjectLinksTab(systemId: string, flows: MinEAObject[]): MinEAObject[] {
  return flows.filter((flow) => flowIsSystemToSystem(flow) && flowInvolvesSystem(flow, systemId));
}

export function flowEndpointKindLabel(kind: FlowEndpointKind): string {
  switch (kind) {
    case "application":
    case "solution":
    case "technical_capability":
      return "System";
    case "component":
      return "Component";
    case "data_object":
      return "Data entity";
    default:
      return String(kind).replace(/_/g, " ");
  }
}

export function summarizeFlowEndpoints(props: IntegrationFlowProperties): string {
  return `${flowFromLine(props)} → ${flowToLine(props)}`;
}
