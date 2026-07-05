import type {
  ApplicationProperties,
  FlowEndpointKind,
  FlowEndpointRef,
  IntegrationFlowProperties,
  MinEAObject,
} from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { flowProps } from "@/lib/flow-list-utils";
import { flowFromLine, flowToLine, isFlowSystemEndpointKind } from "@/lib/flow-utils";

export function systemFlowEndpoint(system: MinEAObject): FlowEndpointRef {
  const vendor = (system.properties as ApplicationProperties)?.vendor?.trim();
  return {
    endpoint_id: system.id,
    endpoint_name: system.name,
    endpoint_kind:
      system.type === "solution" || system.type === "technical_capability"
        ? system.type
        : "application",
    context_label: vendor || undefined,
  };
}

export async function linkFlowToSystem(
  orgSlug: string,
  workspaceSlug: string,
  flow: MinEAObject,
  systemEndpoint: FlowEndpointRef,
  token: string
): Promise<MinEAObject> {
  if (flowInvolvesSystem(flow, systemEndpoint.endpoint_id)) {
    return flow;
  }

  const props = flowProps(flow);
  const updated: IntegrationFlowProperties = {
    ...props,
    from: systemEndpoint,
  };

  return objectsApi.update(orgSlug, workspaceSlug, flow.id, {
    properties: updated as Record<string, unknown>,
  }, token);
}

export async function unlinkFlowFromSystem(
  orgSlug: string,
  workspaceSlug: string,
  flow: MinEAObject,
  systemId: string,
  token: string
): Promise<MinEAObject> {
  const props = flowProps(flow);
  const patch: Record<string, unknown> = {};

  if (
    props.from?.endpoint_id === systemId &&
    isFlowSystemEndpointKind(props.from.endpoint_kind)
  ) {
    patch.from = null;
  }
  if (
    props.to?.endpoint_id === systemId &&
    isFlowSystemEndpointKind(props.to.endpoint_kind)
  ) {
    patch.to = null;
  }

  if (props.sources?.systems?.some((s) => s.system_id === systemId)) {
    patch.sources = {
      ...props.sources,
      systems: props.sources.systems.filter((s) => s.system_id !== systemId),
    };
  }
  if (props.destinations?.systems?.some((s) => s.system_id === systemId)) {
    patch.destinations = {
      ...props.destinations,
      systems: props.destinations.systems.filter((s) => s.system_id !== systemId),
    };
  }

  if (Object.keys(patch).length === 0) {
    return flow;
  }

  return objectsApi.update(orgSlug, workspaceSlug, flow.id, { properties: patch }, token);
}

export function flowCanUnlinkFromSystem(flow: MinEAObject, systemId: string): boolean {
  return flowInvolvesSystem(flow, systemId);
}

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
  const legacySystemIds = [
    ...(props.sources?.systems ?? []).map((s) => s.system_id),
    ...(props.destinations?.systems ?? []).map((s) => s.system_id),
  ];
  return legacySystemIds.includes(systemId);
}

export function flowIdsLinkedToSystem(systemId: string, flows: MinEAObject[]): string[] {
  return flows.filter((flow) => flowInvolvesSystem(flow, systemId)).map((flow) => flow.id);
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
