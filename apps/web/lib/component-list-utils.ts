import { COMPONENT_TYPE_LABEL } from "@/lib/component-utils";
import { aiRoleLabel } from "@/lib/ai-role-utils";
import type { AiRole, ComponentProperties, MinEAObject } from "@minea/types";

export type ComponentSortKey =
  | "name"
  | "type"
  | "tech_stack"
  | "systems"
  | "platform"
  | "runtime"
  | "owner"
  | "status"
  | "updated";

export function componentProps(object: MinEAObject): ComponentProperties {
  return (object.properties ?? {}) as ComponentProperties;
}

export function componentTypeLabel(object: MinEAObject): string {
  const type = componentProps(object).component_type ?? "";
  return COMPONENT_TYPE_LABEL[type] ?? type;
}

export function componentTechStack(object: MinEAObject): string {
  return componentProps(object).tech_stack?.trim() ?? "";
}

export function componentSystemCount(object: MinEAObject): number {
  return componentProps(object).systems?.length ?? 0;
}

export function componentSystemNames(object: MinEAObject): string {
  return (componentProps(object).systems ?? []).map((s) => s.system_name).join(", ");
}

export function componentPlatformName(object: MinEAObject): string {
  return componentProps(object).platform?.platform_name?.trim() ?? "";
}

export function componentRuntimeName(object: MinEAObject): string {
  return componentProps(object).runtime?.runtime_name?.trim() ?? "";
}

export function filterComponents(
  items: MinEAObject[],
  opts: {
    search: string;
    type: string;
    status: string;
    owner: string;
  }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const tech = componentTechStack(item).toLowerCase();
      const systems = componentSystemNames(item).toLowerCase();
      const platform = componentPlatformName(item).toLowerCase();
      const runtime = componentRuntimeName(item).toLowerCase();
      const type = componentTypeLabel(item).toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !tech.includes(q) &&
        !systems.includes(q) &&
        !platform.includes(q) &&
        !runtime.includes(q) &&
        !type.includes(q)
      ) {
        return false;
      }
    }
    if (opts.type !== "all") {
      const raw = componentProps(item).component_type ?? "";
      if (raw !== opts.type) return false;
    }
    if (opts.status !== "all" && (item.status ?? "planned") !== opts.status) return false;
    if (opts.owner !== "all") {
      const owner = item.owner?.trim() ?? "";
      if (owner !== opts.owner) return false;
    }
    return true;
  });
}

export function sortComponents(
  items: MinEAObject[],
  key: ComponentSortKey,
  dir: "asc" | "desc"
): MinEAObject[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "type":
        cmp = componentTypeLabel(a).localeCompare(componentTypeLabel(b));
        break;
      case "tech_stack":
        cmp = componentTechStack(a).localeCompare(componentTechStack(b));
        break;
      case "systems":
        cmp = componentSystemCount(a) - componentSystemCount(b);
        break;
      case "platform":
        cmp = componentPlatformName(a).localeCompare(componentPlatformName(b));
        break;
      case "runtime":
        cmp = componentRuntimeName(a).localeCompare(componentRuntimeName(b));
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

export function componentFilterOptions(items: MinEAObject[]) {
  const types = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const raw = componentProps(item).component_type;
    if (raw) types.add(raw);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    types: [...types].sort((a, b) =>
      (COMPONENT_TYPE_LABEL[a] ?? a).localeCompare(COMPONENT_TYPE_LABEL[b] ?? b)
    ),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}

export function componentAiRoleLabel(object: MinEAObject): string {
  return aiRoleLabel(componentProps(object).ai_role as AiRole | undefined);
}
