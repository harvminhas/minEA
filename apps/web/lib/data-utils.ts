import type { DataLink } from "@minea/types";

export const DATA_LAYER_COLOR = "#f59e0b";

export const ROLE_TAG_STYLE: Record<string, string> = {
  primary: "bg-emerald-50 text-emerald-700",
  analytical: "bg-violet-50 text-violet-700",
  source: "bg-emerald-50 text-emerald-700",
  target: "bg-violet-50 text-violet-700",
  healthy: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-red-50 text-red-700",
  degraded: "bg-amber-50 text-amber-700",
  batch: "bg-gray-100 text-gray-600",
  event: "bg-gray-100 text-gray-600",
  "many:1": "bg-gray-100 text-gray-600",
  "1:many": "bg-gray-100 text-gray-600",
};

export type DataLinkSection = {
  key: string;
  title: string;
  subtitle: string;
  entityKind: string;
  linkKind: string;
  items: DataLink[];
  readOnly?: boolean;
  actionLabel?: "+ Assign" | "+ Add" | "Change";
  roleTags?: string[];
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function byKind(links: DataLink[], linkKind: string, entityKind?: string) {
  return links.filter(
    (l) => l.link_kind === linkKind && (!entityKind || l.entity_kind === entityKind)
  );
}

export function entityLinkSections(
  links: DataLink[],
  inferredCapabilities: DataLink[],
  inferredProcesses: DataLink[]
): DataLinkSection[] {
  return [
    {
      key: "domain",
      title: "Data Domain",
      subtitle: "GOVERNED BY",
      entityKind: "data_domain",
      linkKind: "governed_by",
      items: byKind(links, "governed_by", "data_domain"),
      actionLabel: "Change",
    },
    {
      key: "stores",
      title: "Data Stores",
      subtitle: "STORED IN",
      entityKind: "data_store",
      linkKind: "stored_in",
      items: byKind(links, "stored_in"),
      actionLabel: "+ Assign",
      roleTags: ["primary", "analytical"],
    },
    {
      key: "system",
      title: "System of Record",
      subtitle: "MANAGED BY",
      entityKind: "application",
      linkKind: "managed_by",
      items: byKind(links, "managed_by"),
      actionLabel: "Change",
    },
    {
      key: "integrations",
      title: "Integrations",
      subtitle: "MOVED BY",
      entityKind: "integration_flow",
      linkKind: "moved_by",
      items: byKind(links, "moved_by"),
      actionLabel: "+ Assign",
      roleTags: ["batch", "event"],
    },
    {
      key: "capabilities",
      title: "Capabilities",
      subtitle: "",
      entityKind: "capability",
      linkKind: "uses",
      items: inferredCapabilities,
      readOnly: true,
    },
    {
      key: "processes",
      title: "Processes",
      subtitle: "",
      entityKind: "process",
      linkKind: "reads_writes",
      items: inferredProcesses,
      readOnly: true,
    },
  ];
}

export function storeLinkSections(links: DataLink[]): DataLinkSection[] {
  return [
    {
      key: "domain",
      title: "Data Domain",
      subtitle: "GOVERNED BY",
      entityKind: "data_domain",
      linkKind: "governed_by",
      items: byKind(links, "governed_by", "data_domain"),
      actionLabel: "Change",
    },
    {
      key: "entities",
      title: "Data Entities",
      subtitle: "STORES",
      entityKind: "data_object",
      linkKind: "stores",
      items: byKind(links, "stores"),
      actionLabel: "+ Add",
      roleTags: ["primary"],
    },
    {
      key: "host",
      title: "Hosting System",
      subtitle: "",
      entityKind: "application",
      linkKind: "hosts",
      items: byKind(links, "hosts"),
      actionLabel: "Change",
    },
    {
      key: "integrations",
      title: "Integrations",
      subtitle: "SOURCE / TARGET",
      entityKind: "integration_flow",
      linkKind: "source_target",
      items: byKind(links, "source_target"),
      actionLabel: "+ Assign",
      roleTags: ["source", "target"],
    },
  ];
}

export function domainLinkSections(links: DataLink[]): DataLinkSection[] {
  const entities = byKind(links, "governs", "data_object");
  const stores = byKind(links, "governs", "data_store");
  return [
    {
      key: "entities",
      title: "Data Entities",
      subtitle: `GOVERNS · ${entities.length}`,
      entityKind: "data_object",
      linkKind: "governs",
      items: entities,
      actionLabel: "+ Add",
    },
    {
      key: "stores",
      title: "Data Stores",
      subtitle: `GOVERNS · ${stores.length}`,
      entityKind: "data_store",
      linkKind: "governs",
      items: stores,
      actionLabel: "+ Add",
    },
    {
      key: "system",
      title: "System of Record",
      subtitle: "",
      entityKind: "application",
      linkKind: "system_of_record",
      items: byKind(links, "system_of_record"),
      actionLabel: "Change",
    },
  ];
}

export function entityPath(
  basePath: string,
  entityKind: string,
  _entityId: string
): string | null {
  switch (entityKind) {
    case "data_object":
      return `${basePath}/data/data-objects`;
    case "data_store":
      return `${basePath}/data/data-stores`;
    case "data_domain":
      return `${basePath}/data/data-domains`;
    case "application":
      return `${basePath}/application/applications`;
    case "integration_flow":
      return `${basePath}/integration/flows`;
    case "capability":
    case "business_domain":
      return `${basePath}/business/capabilities`;
    case "process":
      return `${basePath}/views/processes`;
    default:
      return null;
  }
}
