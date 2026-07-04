import { FLOW_MECHANISMS } from "@/lib/flow-utils";
import { flowEndpointCount } from "@/lib/flow-relationship-utils";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import {
  flowFromLine,
  flowMechanismLabel,
  flowToLine,
  flowHasV2Endpoints,
} from "@/lib/flow-utils";

const MECHANISM_LABEL = Object.fromEntries(FLOW_MECHANISMS.map((m) => [m.value, m.label]));

export type FlowSortKey =
  | "name"
  | "mechanism"
  | "from"
  | "to"
  | "owner"
  | "status"
  | "updated";

export function flowProps(object: MinEAObject): IntegrationFlowProperties {
  return (object.properties ?? {}) as IntegrationFlowProperties;
}

export function flowProtocolLabel(object: MinEAObject): string {
  return flowMechanismLabel(flowProps(object));
}

export function flowDirectionLabel(object: MinEAObject): string {
  const props = flowProps(object);
  if (flowHasV2Endpoints(props)) return "One-way";
  return props.direction?.replace(/_/g, " ") ?? "—";
}

export function flowFrequencyLabel(object: MinEAObject): string {
  const props = flowProps(object);
  if (props.schedule) return props.schedule;
  return props.frequency?.replace(/_/g, " ") ?? "—";
}

export function flowSourceCount(object: MinEAObject): number {
  const props = flowProps(object);
  if (props.from) return 1;
  return flowEndpointCount(props.sources);
}

export function flowDestinationCount(object: MinEAObject): number {
  const props = flowProps(object);
  if (props.to) return 1;
  return flowEndpointCount(props.destinations);
}

export function filterFlows(
  items: MinEAObject[],
  opts: { search: string; mechanism: string; status: string; owner: string }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const props = flowProps(item);
      const mechanism = flowMechanismLabel(props).toLowerCase();
      const from = flowFromLine(props).toLowerCase();
      const to = flowToLine(props).toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !mechanism.includes(q) &&
        !from.includes(q) &&
        !to.includes(q)
      ) {
        return false;
      }
    }
    if (opts.mechanism !== "all") {
      const m = flowProps(item).mechanism ?? flowProps(item).protocol ?? "";
      if (m !== opts.mechanism) return false;
    }
    if (opts.status !== "all" && (item.status ?? "planned") !== opts.status) return false;
    if (opts.owner !== "all") {
      const owner = item.owner?.trim() ?? "";
      if (owner !== opts.owner) return false;
    }
    return true;
  });
}

export function sortFlows(
  items: MinEAObject[],
  key: FlowSortKey,
  dir: "asc" | "desc"
): MinEAObject[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "mechanism":
        cmp = flowProtocolLabel(a).localeCompare(flowProtocolLabel(b));
        break;
      case "from":
        cmp = flowFromLine(flowProps(a)).localeCompare(flowFromLine(flowProps(b)));
        break;
      case "to":
        cmp = flowToLine(flowProps(a)).localeCompare(flowToLine(flowProps(b)));
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

export function flowFilterOptions(items: MinEAObject[]) {
  const mechanisms = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const p = flowProps(item);
    const m = p.mechanism ?? p.protocol;
    if (m) mechanisms.add(m);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    mechanisms: [...mechanisms].sort((a, b) =>
      (MECHANISM_LABEL[a] ?? a).localeCompare(MECHANISM_LABEL[b] ?? b)
    ),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}
