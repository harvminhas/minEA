import {
  infraKindLabel,
  infraVendorLabel,
  INFRA_KIND_LABEL,
  INFRA_VENDOR_LABEL,
} from "@/lib/integration-infra-utils";
import type { MinEAObject, ToolProperties } from "@minea/types";

export type InfraSortKey = "name" | "kind" | "vendor" | "owner" | "status" | "updated";

export function infraProps(object: MinEAObject): ToolProperties {
  return (object.properties ?? {}) as ToolProperties;
}

export function infraKindLabelForItem(object: MinEAObject): string {
  return infraKindLabel(infraProps(object));
}

export function infraKindValue(object: MinEAObject): string {
  const props = infraProps(object);
  return props.integration_infra_kind ?? "";
}

export function infraVendorLabelForItem(object: MinEAObject): string {
  return infraVendorLabel(infraProps(object).vendor);
}

export function infraVendorValue(object: MinEAObject): string {
  return infraProps(object).vendor?.trim() ?? "";
}

export function filterIntegrationInfra(
  items: MinEAObject[],
  opts: { search: string; kind: string; vendor: string; status: string; owner: string }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const kind = infraKindLabelForItem(item).toLowerCase();
      const vendor = infraVendorLabelForItem(item).toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !kind.includes(q) &&
        !vendor.includes(q)
      ) {
        return false;
      }
    }
    if (opts.kind !== "all" && infraKindValue(item) !== opts.kind) return false;
    if (opts.vendor !== "all" && infraVendorValue(item) !== opts.vendor) return false;
    if (opts.status !== "all" && (item.status ?? "planned") !== opts.status) return false;
    if (opts.owner !== "all") {
      const owner = item.owner?.trim() ?? "";
      if (owner !== opts.owner) return false;
    }
    return true;
  });
}

export function sortIntegrationInfra(
  items: MinEAObject[],
  key: InfraSortKey,
  dir: "asc" | "desc"
): MinEAObject[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "kind":
        cmp = infraKindLabelForItem(a).localeCompare(infraKindLabelForItem(b));
        break;
      case "vendor":
        cmp = infraVendorLabelForItem(a).localeCompare(infraVendorLabelForItem(b));
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

export function infraFilterOptions(items: MinEAObject[]) {
  const kinds = new Set<string>();
  const vendors = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const kind = infraKindValue(item);
    if (kind) kinds.add(kind);
    const vendor = infraVendorValue(item);
    if (vendor) vendors.add(vendor);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    kinds: [...kinds].sort((a, b) =>
      (INFRA_KIND_LABEL[a] ?? a).localeCompare(INFRA_KIND_LABEL[b] ?? b)
    ),
    vendors: [...vendors].sort((a, b) =>
      (INFRA_VENDOR_LABEL[a] ?? a).localeCompare(INFRA_VENDOR_LABEL[b] ?? b)
    ),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}
