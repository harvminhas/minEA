import type { AccountabilityEntityKind, PeopleAccountability } from "@minea/types";

export const PEOPLE_LAYER_COLOR = "#e11d48";

export const LINK_KIND_STYLE: Record<string, string> = {
  owns: "bg-violet-50 text-violet-700",
  performs: "bg-emerald-50 text-emerald-700",
  stewards: "bg-indigo-50 text-indigo-700",
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
  return kind.replace(/_/g, " ");
}

export function entityPath(
  basePath: string,
  entityKind: AccountabilityEntityKind | string,
  _entityId: string
): string | null {
  switch (entityKind) {
    case "product":
      return `${basePath}/views/products`;
    case "process":
      return `${basePath}/views/processes`;
    case "capability":
    case "business_domain":
      return `${basePath}/business/capabilities`;
    case "application":
      return `${basePath}/application/applications`;
    default:
      return null;
  }
}

export type AccountabilitySection = {
  key: string;
  title: string;
  subtitle: string;
  entityKind: AccountabilityEntityKind | string;
  linkKind: string;
  items: PeopleAccountability[];
};

export function groupAccountabilities(
  accountabilities: PeopleAccountability[],
  includeDomains = false
): AccountabilitySection[] {
  const byKey = (kind: string, link: string) =>
    accountabilities.filter((a) => a.entity_kind === kind && a.link_kind === link);

  const sections: AccountabilitySection[] = [
    {
      key: "products-owns",
      title: "Products",
      subtitle: "OWNS",
      entityKind: "product",
      linkKind: "owns",
      items: byKey("product", "owns"),
    },
    {
      key: "capabilities-owns",
      title: "Capabilities",
      subtitle: "OWNS",
      entityKind: "capability",
      linkKind: "owns",
      items: byKey("capability", "owns"),
    },
  ];

  if (includeDomains) {
    sections.push({
      key: "domains-owns",
      title: "Capability Domains",
      subtitle: "OWNS",
      entityKind: "business_domain",
      linkKind: "owns",
      items: byKey("business_domain", "owns"),
    });
  }

  sections.push(
    {
      key: "processes-owns",
      title: "Processes",
      subtitle: "OWNS",
      entityKind: "process",
      linkKind: "owns",
      items: byKey("process", "owns"),
    },
    {
      key: "processes-performs",
      title: "Processes",
      subtitle: "PERFORMS",
      entityKind: "process",
      linkKind: "performs",
      items: byKey("process", "performs"),
    },
    {
      key: "systems-stewards",
      title: "Systems",
      subtitle: "STEWARDS",
      entityKind: "application",
      linkKind: "stewards",
      items: byKey("application", "stewards"),
    }
  );

  return sections;
}
