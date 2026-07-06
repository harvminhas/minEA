import type { ApplicationProperties, MinEAObject } from "@minea/types";
import { formatSystemCategoryLabel, mergeCategoryOptions } from "@/lib/system-category";
import {
  systemDiscovery,
  systemGovernanceLabel,
  systemGovernanceStatus,
} from "@/lib/system-governance";

const AVATAR_COLORS = ["#3b82f6", "#f97316", "#16a34a", "#8b5cf6", "#0ea5e9", "#6b7280"];

export { mergeCategoryOptions };

export type SystemSortKey =
  | "name"
  | "vendor"
  | "category"
  | "governance"
  | "cost"
  | "capabilities"
  | "owner"
  | "status"
  | "updated";

export function systemProps(object: MinEAObject): ApplicationProperties {
  return (object.properties ?? {}) as ApplicationProperties;
}

export function systemVendor(object: MinEAObject): string {
  return systemProps(object).vendor?.trim() ?? "";
}

export function systemCategory(object: MinEAObject): string {
  const props = systemProps(object);
  return formatSystemCategoryLabel(props.category, props);
}

export function systemGovernance(object: MinEAObject): string {
  return systemGovernanceLabel(systemProps(object));
}

export function systemGovernanceValue(object: MinEAObject): ReturnType<typeof systemGovernanceStatus> {
  return systemGovernanceStatus(systemProps(object));
}

export function systemDiscoveryNote(object: MinEAObject): string {
  return systemDiscovery(systemProps(object));
}

export function systemAnnualCost(object: MinEAObject): number | null {
  const raw = systemProps(object).annual_cost;
  if (raw == null || Number(raw) <= 0) return null;
  return Number(raw);
}

export function systemAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function filterSystems(
  items: MinEAObject[],
  opts: {
    search: string;
    category: string;
    governance: string;
    status: string;
    owner: string;
  }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const vendor = systemVendor(item).toLowerCase();
      const category = systemCategory(item).toLowerCase();
      const governance = systemGovernance(item).toLowerCase();
      const discovery = systemDiscoveryNote(item).toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !vendor.includes(q) &&
        !category.includes(q) &&
        !governance.includes(q) &&
        !discovery.includes(q)
      ) {
        return false;
      }
    }
    if (opts.category !== "all") {
      const cat = systemCategory(item);
      if (cat !== opts.category) return false;
    }
    if (opts.governance !== "all") {
      if (systemGovernanceValue(item) !== opts.governance) return false;
    }
    if (opts.status !== "all" && (item.status ?? "planned") !== opts.status) return false;
    if (opts.owner !== "all") {
      const owner = item.owner?.trim() ?? "";
      if (owner !== opts.owner) return false;
    }
    return true;
  });
}

export function sortSystems(
  items: MinEAObject[],
  key: SystemSortKey,
  dir: "asc" | "desc"
): MinEAObject[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "vendor":
        cmp = systemVendor(a).localeCompare(systemVendor(b));
        break;
      case "category":
        cmp = systemCategory(a).localeCompare(systemCategory(b));
        break;
      case "governance":
        cmp = systemGovernance(a).localeCompare(systemGovernance(b));
        break;
      case "cost":
        cmp = (systemAnnualCost(a) ?? 0) - (systemAnnualCost(b) ?? 0);
        break;
      case "capabilities":
        cmp = (a.capability_count ?? 0) - (b.capability_count ?? 0);
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
    if (cmp === 0) {
      return a.name.localeCompare(b.name);
    }
    return mult * cmp;
  });
}

export function systemFilterOptions(items: MinEAObject[]) {
  const categories = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const cat = systemCategory(item);
    if (cat) categories.add(cat);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}
