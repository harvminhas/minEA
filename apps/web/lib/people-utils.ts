import type { AccountabilityEntityKind, AccountabilityLinkKind, PeopleAccountability } from "@minea/types";

export const PEOPLE_LAYER_COLOR = "#e11d48";

export const ACCOUNTABILITY_LINK_OPTIONS: Record<
  AccountabilityLinkKind,
  { label: string; description: string }
> = {
  owns: { label: "owns", description: "Accountable for this" },
  performs: { label: "performs", description: "Carries out this process" },
  approves: { label: "approves", description: "Sign-off authority" },
  informed: { label: "informed", description: "Kept in the loop" },
  stewards: { label: "stewards", description: "Data custodian" },
  manages: { label: "manages", description: "Operational owner" },
};

/** Allowed relationship verbs per entity type. */
export const LINK_KINDS_BY_ENTITY: Record<string, AccountabilityLinkKind[]> = {
  product: ["owns", "informed"],
  capability: ["owns", "informed"],
  business_domain: ["owns", "informed"],
  process: ["owns", "performs", "approves", "informed"],
  application: ["stewards", "manages", "approves"],
  data_domain: ["owns", "informed"],
  data_store: ["stewards", "manages"],
};

export const LINK_KIND_STYLE: Record<string, string> = {
  owns: "bg-violet-50 text-violet-700",
  performs: "bg-emerald-50 text-emerald-700",
  approves: "bg-amber-50 text-amber-700",
  informed: "bg-sky-50 text-sky-700",
  stewards: "bg-indigo-50 text-indigo-700",
  manages: "bg-teal-50 text-teal-700",
};

export const ASSIGNMENT_KIND_STYLE: Record<string, string> = {
  owner: "bg-violet-50 text-violet-700",
  performer: "bg-emerald-50 text-emerald-700",
  steward: "bg-indigo-50 text-indigo-700",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function formatLinkKind(kind: string): string {
  return ACCOUNTABILITY_LINK_OPTIONS[kind as AccountabilityLinkKind]?.label ?? kind.replace(/_/g, " ");
}

export function linkKindsForEntity(entityKind: string): AccountabilityLinkKind[] {
  return LINK_KINDS_BY_ENTITY[entityKind] ?? ["owns"];
}

export function entityPath(
  basePath: string,
  entityKind: AccountabilityEntityKind | string,
  _entityId: string
): string | null {
  switch (entityKind) {
    case "product":
      return `${basePath}/strategy/products`;
    case "process":
      return `${basePath}/views/processes`;
    case "capability":
    case "business_domain":
      return `${basePath}/business/capabilities`;
    case "application":
      return `${basePath}/application/applications`;
    case "data_domain":
      return `${basePath}/data/data-domains`;
    case "data_store":
      return `${basePath}/data/data-stores`;
    default:
      return null;
  }
}

export type AccountabilitySection = {
  key: string;
  title: string;
  subtitle: string;
  entityKind: AccountabilityEntityKind | string;
  linkKinds: AccountabilityLinkKind[];
  items: PeopleAccountability[];
};

function sectionSubtitle(linkKinds: AccountabilityLinkKind[]): string {
  return linkKinds.map((k) => ACCOUNTABILITY_LINK_OPTIONS[k].label.toUpperCase()).join(" · ");
}

export function groupAccountabilities(
  accountabilities: PeopleAccountability[],
  includeDomains = false
): AccountabilitySection[] {
  const byEntity = (kind: string) => accountabilities.filter((a) => a.entity_kind === kind);

  const sections: AccountabilitySection[] = [
    {
      key: "products",
      title: "Products",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.product),
      entityKind: "product",
      linkKinds: LINK_KINDS_BY_ENTITY.product,
      items: byEntity("product"),
    },
    {
      key: "capabilities",
      title: "Capabilities",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.capability),
      entityKind: "capability",
      linkKinds: LINK_KINDS_BY_ENTITY.capability,
      items: byEntity("capability"),
    },
  ];

  if (includeDomains) {
    sections.push({
      key: "domains",
      title: "Capability Domains",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.business_domain),
      entityKind: "business_domain",
      linkKinds: LINK_KINDS_BY_ENTITY.business_domain,
      items: byEntity("business_domain"),
    });
  }

  sections.push(
    {
      key: "processes",
      title: "Processes",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.process),
      entityKind: "process",
      linkKinds: LINK_KINDS_BY_ENTITY.process,
      items: byEntity("process"),
    },
    {
      key: "systems",
      title: "Systems",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.application),
      entityKind: "application",
      linkKinds: LINK_KINDS_BY_ENTITY.application,
      items: byEntity("application"),
    },
    {
      key: "data_domains",
      title: "Data Domains",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.data_domain),
      entityKind: "data_domain",
      linkKinds: LINK_KINDS_BY_ENTITY.data_domain,
      items: byEntity("data_domain"),
    },
    {
      key: "data_stores",
      title: "Data Stores",
      subtitle: sectionSubtitle(LINK_KINDS_BY_ENTITY.data_store),
      entityKind: "data_store",
      linkKinds: LINK_KINDS_BY_ENTITY.data_store,
      items: byEntity("data_store"),
    }
  );

  return sections;
}

export function accountabilityPairKey(entityId: string, linkKind: string): string {
  return `${entityId}:${linkKind}`;
}
