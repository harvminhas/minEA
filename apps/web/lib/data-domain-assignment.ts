import type { DataDomainProperties, MinEAObject } from "@minea/types";

/** UI label for missing governance assignment — not a repository domain object. */
export const UNASSIGNED_DOMAIN_LABEL = "Unassigned";

/** Legacy fallback domain created before optional assignment was supported. */
export const LEGACY_DEFAULT_DOMAIN_NAME = "Unassigned";

export type DomainSelectOption = { value: string; label: string };

export function isLegacyDefaultDomain(domain: MinEAObject): boolean {
  const props = (domain.properties ?? {}) as DataDomainProperties & { is_default?: boolean };
  return domain.name === LEGACY_DEFAULT_DOMAIN_NAME && props.is_default === true;
}

export function isGovernanceDomainUnassigned(
  item: Pick<MinEAObject, "data_domain_name"> & { data_domain_id?: string | null }
): boolean {
  if (!item.data_domain_id && !item.data_domain_name) return true;
  if (item.data_domain_name === LEGACY_DEFAULT_DOMAIN_NAME) return true;
  return false;
}

export function governanceDomainDisplayName(
  item: Pick<MinEAObject, "data_domain_name"> & { data_domain_id?: string | null }
): string {
  return isGovernanceDomainUnassigned(item) ? UNASSIGNED_DOMAIN_LABEL : item.data_domain_name ?? UNASSIGNED_DOMAIN_LABEL;
}

export function normalizeDomainFormValue(
  domainId: string | null | undefined,
  domainName: string | null | undefined
): string {
  if (!domainId) return "";
  if (domainName === LEGACY_DEFAULT_DOMAIN_NAME) return "";
  return domainId;
}

export function buildDomainSelectOptions(
  domains: MinEAObject[]
): DomainSelectOption[] {
  return domains
    .filter((domain) => !isLegacyDefaultDomain(domain))
    .map((domain) => ({ value: domain.id, label: domain.name }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function countUnassignedEntities(items: MinEAObject[]): number {
  return items.filter((item) => item.type === "data_object" && isGovernanceDomainUnassigned(item)).length;
}

export function countUnassignedStores(items: MinEAObject[]): number {
  return items.filter((item) => item.type === "data_store" && isGovernanceDomainUnassigned(item)).length;
}

export function domainSelectOptionsWithUnassigned(options: DomainSelectOption[]): DomainSelectOption[] {
  return [{ value: "", label: UNASSIGNED_DOMAIN_LABEL }, ...options];
}
