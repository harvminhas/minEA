import {
  accountabilityLabel,
  type AccountabilityEntityKind,
  type AccountabilityLinkKind,
  type PeopleAccountability,
} from "@minea/types";

export const PEOPLE_LAYER_COLOR = "#e11d48";

const LINK_KINDS: AccountabilityLinkKind[] = ["owns", "performs", "approves", "informed", "stewards", "manages"];

/** Picker labels from the shared registry, read from the team / role side ("Owns"). */
export const ACCOUNTABILITY_LINK_OPTIONS = Object.fromEntries(
  LINK_KINDS.map((kind) => {
    const words = accountabilityLabel(kind);
    return [kind, { label: words.forward, description: words.description }];
  })
) as Record<AccountabilityLinkKind, { label: string; description: string }>;

/**
 * The verb to show for one accountability row. The owner-team sync row reads "Owns" even when an
 * older sync stored it as manages / stewards (rows are never rewritten; dev and prod share one DB).
 */
export function accountabilityDisplayKind(item: Pick<PeopleAccountability, "link_kind" | "is_owner">): string {
  return item.is_owner ? "owns" : item.link_kind;
}

/** "Owns" from the team side, "Owned by" from the entity side. */
export function accountabilityWords(
  item: Pick<PeopleAccountability, "link_kind" | "is_owner">,
  side: "subject" | "entity" = "subject"
): string {
  const words = accountabilityLabel(accountabilityDisplayKind(item));
  return side === "subject" ? words.forward : words.reverse;
}

/** Allowed relationship verbs per entity type. */
export const LINK_KINDS_BY_ENTITY: Record<string, AccountabilityLinkKind[]> = {
  product: ["owns", "informed"],
  capability: ["owns", "informed"],
  business_domain: ["owns", "informed"],
  process: ["owns", "performs", "approves", "informed"],
  application: ["owns", "stewards", "manages", "approves"],
  data_domain: ["owns", "informed"],
  data_store: ["owns", "stewards", "manages"],
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
    case "journey":
      return `${basePath}/views/journeys`;
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

/** people_accountabilities.entity_kind for a catalog object type (solution rows are stored as application). */
export function accountabilityEntityKindOf(objectType: string): AccountabilityEntityKind | null {
  if (objectType === "solution") return "application";
  const kinds: string[] = ["capability", "business_domain", "application", "data_domain", "data_store", "product", "process"];
  return kinds.includes(objectType) ? (objectType as AccountabilityEntityKind) : null;
}
