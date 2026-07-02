import type { DataLink, DataDomainProperties, DataObjectProperties, DataStoreProperties, MinEAObject } from "@minea/types";

export const DATA_LAYER_COLOR = "#f59e0b";

export const ENTITY_ICON_STYLE = "bg-violet-50 text-violet-700";
export const STORE_ICON_STYLE = "bg-emerald-50 text-emerald-700";
export const DOMAIN_ICON_STYLE = "bg-amber-50 text-amber-700";

export const STORE_TYPE_LABEL: Record<string, string> = {
  relational_db: "Relational DB",
  document_db: "Document DB",
  data_warehouse: "Data warehouse",
  data_lake: "Data lake",
  file_store: "File store",
  cache: "Cache",
};

export const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  at_risk: "At risk",
  degraded: "Degraded",
};

export const HEALTH_STYLE: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  degraded: "bg-orange-50 text-orange-700",
};

export const CLASSIFICATION_LABEL: Record<string, string> = {
  core: "Core",
  reference: "Reference",
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  pii: "PII",
  restricted: "Restricted",
  financial: "Financial",
};

export const PII_BADGE_STYLE = "bg-red-50 text-red-700";
export const DOMAIN_CLASSIFICATION_STYLE = "bg-orange-50 text-orange-700";

export function formatEntitySubtitle(item: MinEAObject): string {
  const props = (item.properties ?? {}) as DataObjectProperties;
  const classification = props.classification
    ? (CLASSIFICATION_LABEL[props.classification] ?? props.classification)
    : null;
  return classification ? `Data entity · ${classification}` : "Data entity";
}

export function formatStoreSubtitle(item: MinEAObject): string {
  const props = (item.properties ?? {}) as DataStoreProperties;
  const storeType = props.store_type
    ? (STORE_TYPE_LABEL[props.store_type] ?? props.store_type.replace(/_/g, " "))
    : null;
  return storeType ?? "Data store";
}

export function formatDomainSubtitle(item: MinEAObject): string {
  const props = (item.properties ?? {}) as DataDomainProperties;
  const classification = props.classification
    ? (CLASSIFICATION_LABEL[props.classification] ?? props.classification)
    : null;
  return classification ? `Data domain · ${classification}` : "Data domain";
}

export function entityTopBadge(item: MinEAObject): { label: string; className: string } | null {
  const props = (item.properties ?? {}) as DataObjectProperties;
  if (props.sensitivity === "pii" || props.classification === "pii") {
    return { label: "PII", className: PII_BADGE_STYLE };
  }
  return null;
}

export function storeTopBadge(item: MinEAObject): { label: string; className: string } | null {
  const props = (item.properties ?? {}) as DataStoreProperties;
  const health = props.health;
  if (!health) return null;
  return {
    label: HEALTH_LABEL[health] ?? health,
    className: HEALTH_STYLE[health] ?? "bg-gray-100 text-gray-600",
  };
}

export function domainTopBadge(item: MinEAObject): { label: string; className: string } | null {
  const props = (item.properties ?? {}) as DataDomainProperties;
  const classification = props.classification;
  if (!classification) return null;
  return {
    label: CLASSIFICATION_LABEL[classification] ?? classification,
    className: DOMAIN_CLASSIFICATION_STYLE,
  };
}

export function formatSensitivityLabel(item: MinEAObject): string {
  const props = (item.properties ?? {}) as DataObjectProperties;
  const value = props.sensitivity ?? props.classification;
  if (!value) return "—";
  return CLASSIFICATION_LABEL[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatTechnology(item: MinEAObject): string {
  const props = (item.properties ?? {}) as DataStoreProperties;
  return props.technology?.trim() || "—";
}

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
  /** When true, linked rows are display-only (no navigation). */
  nonNavigable?: boolean;
  /** Shown under the section when populated (e.g. assignment hints). */
  footnote?: string;
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

export function entityStoreLinks(links: DataLink[]): DataLink[] {
  return byKind(links, "stored_in", "data_store");
}

export function entityStoreAssignSection(links: DataLink[]): DataLinkSection {
  return {
    key: "stores",
    title: "Data Stores",
    subtitle: "STORED IN · many ↔ many",
    entityKind: "data_store",
    linkKind: "stored_in",
    items: entityStoreLinks(links),
    actionLabel: "+ Assign",
    roleTags: ["primary", "analytical"],
    footnote:
      "An entity can live in multiple stores. Tag one as primary for the system-of-record location.",
  };
}

export function storeLinkSections(links: DataLink[]): DataLinkSection[] {
  return [
    {
      key: "domain",
      title: "Data Domains",
      subtitle: "BELONGS TO",
      entityKind: "data_domain",
      linkKind: "governed_by",
      items: byKind(links, "governed_by", "data_domain"),
      actionLabel: "+ Assign",
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
