import type { MinEAObject, ToolProperties } from "@minea/types";
import {
  infraKindLabel,
  infraSupportsHandle,
  isIntegrationInfra,
  type IntegrationInfraHandle,
} from "@/lib/integration-infra-utils";

export type InfraCarrierOption = {
  id: string;
  name: string;
  /** Kind label or legacy platform/transport hint */
  subtitle?: string;
  platform?: string;
  transport?: string;
  object_type?: "tool" | "message_broker";
};

export const integrationInfraToolsQueryKey = (
  orgSlug: string,
  workspaceSlug: string
) => ["objects", orgSlug, workspaceSlug, "integration_infra_tools"] as const;

export function isLegacyApiGatewayTool(props: ToolProperties): boolean {
  return !!props.gateway_platform;
}

/** Integration infra tools that support a given handle. */
export function integrationInfraCarrierOptions(
  items: MinEAObject[],
  handle: IntegrationInfraHandle
): InfraCarrierOption[] {
  return items
    .filter((item) => {
      const props = (item.properties ?? {}) as ToolProperties;
      return isIntegrationInfra(props) && infraSupportsHandle(props, handle);
    })
    .map((item) => {
      const props = (item.properties ?? {}) as ToolProperties;
      return {
        id: item.id,
        name: item.name,
        subtitle: infraKindLabel(props),
        object_type: "tool" as const,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** API gateway dropdown: infra with APIs handle + legacy gateway_platform tools. */
export function apiGatewayCarrierOptions(items: MinEAObject[]): InfraCarrierOption[] {
  const seen = new Set<string>();
  const options: InfraCarrierOption[] = [];

  for (const item of items) {
    const props = (item.properties ?? {}) as ToolProperties;
    if (isIntegrationInfra(props) && infraSupportsHandle(props, "apis")) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        options.push({
          id: item.id,
          name: item.name,
          subtitle: infraKindLabel(props),
          platform: props.integration_infra_kind === "gateway" ? "gateway" : undefined,
        });
      }
    } else if (isLegacyApiGatewayTool(props) && !seen.has(item.id)) {
      seen.add(item.id);
      options.push({
        id: item.id,
        name: item.name,
        subtitle: "Legacy gateway",
        platform: props.gateway_platform,
        object_type: "tool" as const,
      });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** Event broker dropdown: infra with Events handle + legacy message_broker objects. */
export function eventBrokerCarrierOptions(
  infraTools: MinEAObject[],
  legacyBrokers: MinEAObject[]
): InfraCarrierOption[] {
  const options = integrationInfraCarrierOptions(infraTools, "events");
  const seen = new Set(options.map((o) => o.id));

  for (const broker of legacyBrokers) {
    if (seen.has(broker.id)) continue;
    seen.add(broker.id);
    options.push({
      id: broker.id,
      name: broker.name,
      subtitle: "Message broker",
      transport: (broker.properties as Record<string, unknown>)?.transport as string | undefined,
      object_type: "message_broker" as const,
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatCarrierOptionLabel(option: InfraCarrierOption): string {
  return option.subtitle ? `${option.name} · ${option.subtitle}` : option.name;
}

const HANDLE_LABEL: Record<IntegrationInfraHandle, string> = {
  apis: "APIs",
  events: "Events",
  flows: "Flows",
  data: "Data",
};

/** Helper copy shown under infrastructure dropdowns. */
export function infraCarrierFieldHint(
  handle: IntegrationInfraHandle,
  hasOptions: boolean
): { text: string; tone: "muted" | "notice" } {
  const label = HANDLE_LABEL[handle];
  if (hasOptions) {
    return {
      text: `Lists integration infrastructure with the ${label} handle. Add more under Integration → Integration Infrastructure.`,
      tone: "muted",
    };
  }
  return {
    text: `No ${label} infrastructure yet. Create one under Integration → Integration Infrastructure and enable the ${label} handle.`,
    tone: "notice",
  };
}
