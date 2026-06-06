import { API_AUTH_LABEL, API_CRITICALITY_LABEL, API_STYLE_LABEL } from "@/lib/api-utils";
import type { ApiProperties, MinEAObject } from "@minea/types";

export type ApiSortKey =
  | "name"
  | "style"
  | "provider"
  | "consumers"
  | "auth"
  | "criticality"
  | "owner"
  | "status"
  | "updated";

export function apiProps(object: MinEAObject): ApiProperties {
  return (object.properties ?? {}) as ApiProperties;
}

export function apiStyleLabel(object: MinEAObject): string {
  const protocol = apiProps(object).protocol ?? "";
  return API_STYLE_LABEL[protocol] ?? protocol;
}

export function apiProviderName(object: MinEAObject): string {
  return apiProps(object).provider?.provider_name?.trim() ?? "";
}

export function apiConsumerCount(object: MinEAObject): number {
  return apiProps(object).consumers?.length ?? 0;
}

export function apiAuthLabel(object: MinEAObject): string {
  const auth = apiProps(object).auth;
  return auth ? (API_AUTH_LABEL[auth] ?? auth) : "";
}

export function apiCriticalityLabel(object: MinEAObject): string {
  const c = apiProps(object).criticality ?? "";
  return c ? (API_CRITICALITY_LABEL[c] ?? c) : "";
}

export function filterApis(
  items: MinEAObject[],
  opts: { search: string; style: string; status: string; owner: string }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const provider = apiProviderName(item).toLowerCase();
      const style = apiStyleLabel(item).toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !provider.includes(q) && !style.includes(q)) {
        return false;
      }
    }
    if (opts.style !== "all" && (apiProps(item).protocol ?? "") !== opts.style) return false;
    if (opts.status !== "all" && (item.status ?? "planned") !== opts.status) return false;
    if (opts.owner !== "all") {
      const owner = item.owner?.trim() ?? "";
      if (owner !== opts.owner) return false;
    }
    return true;
  });
}

export function sortApis(
  items: MinEAObject[],
  key: ApiSortKey,
  dir: "asc" | "desc"
): MinEAObject[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "style":
        cmp = apiStyleLabel(a).localeCompare(apiStyleLabel(b));
        break;
      case "provider":
        cmp = apiProviderName(a).localeCompare(apiProviderName(b));
        break;
      case "consumers":
        cmp = apiConsumerCount(a) - apiConsumerCount(b);
        break;
      case "auth":
        cmp = apiAuthLabel(a).localeCompare(apiAuthLabel(b));
        break;
      case "criticality":
        cmp = apiCriticalityLabel(a).localeCompare(apiCriticalityLabel(b));
        break;
      case "owner":
        cmp = (a.owner?.trim() ?? "").localeCompare(b.owner?.trim() ?? "");
        break;
      case "status":
        cmp = (a.status ?? "planned").localeCompare(b.status ?? "planned");
        break;
      case "updated":
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        break;
    }
    if (cmp === 0) return a.name.localeCompare(b.name);
    return mult * cmp;
  });
}

export function apiFilterOptions(items: MinEAObject[]) {
  const styles = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const protocol = apiProps(item).protocol;
    if (protocol) styles.add(protocol);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    styles: [...styles].sort((a, b) =>
      (API_STYLE_LABEL[a] ?? a).localeCompare(API_STYLE_LABEL[b] ?? b)
    ),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}
