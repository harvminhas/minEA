import { FLOW_DIRECTIONS, FLOW_FREQUENCIES, FLOW_PROTOCOLS } from "@/lib/flow-utils";
import { flowEndpointCount } from "@/lib/flow-relationship-utils";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";

const PROTOCOL_LABEL = Object.fromEntries(FLOW_PROTOCOLS.map((p) => [p.value, p.label]));
const FREQ_LABEL = Object.fromEntries(FLOW_FREQUENCIES.map((f) => [f.value, f.label]));
const DIR_LABEL = Object.fromEntries(FLOW_DIRECTIONS.map((d) => [d.value, d.label]));

export type FlowSortKey =
  | "name"
  | "protocol"
  | "direction"
  | "sources"
  | "destinations"
  | "frequency"
  | "owner"
  | "status"
  | "updated";

export function flowProps(object: MinEAObject): IntegrationFlowProperties {
  return (object.properties ?? {}) as IntegrationFlowProperties;
}

export function flowProtocolLabel(object: MinEAObject): string {
  const p = flowProps(object).protocol ?? "";
  return PROTOCOL_LABEL[p] ?? p;
}

export function flowDirectionLabel(object: MinEAObject): string {
  const d = flowProps(object).direction ?? "";
  return DIR_LABEL[d] ?? d.replace(/_/g, " ");
}

export function flowFrequencyLabel(object: MinEAObject): string {
  const f = flowProps(object).frequency ?? "";
  return FREQ_LABEL[f] ?? f.replace(/_/g, " ");
}

export function flowSourceCount(object: MinEAObject): number {
  return flowEndpointCount(flowProps(object).sources);
}

export function flowDestinationCount(object: MinEAObject): number {
  return flowEndpointCount(flowProps(object).destinations);
}

export function filterFlows(
  items: MinEAObject[],
  opts: { search: string; protocol: string; status: string; owner: string }
): MinEAObject[] {
  const q = opts.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q) {
      const protocol = flowProtocolLabel(item).toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !protocol.includes(q)) return false;
    }
    if (opts.protocol !== "all" && (flowProps(item).protocol ?? "") !== opts.protocol) return false;
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
      case "protocol":
        cmp = flowProtocolLabel(a).localeCompare(flowProtocolLabel(b));
        break;
      case "direction":
        cmp = flowDirectionLabel(a).localeCompare(flowDirectionLabel(b));
        break;
      case "sources":
        cmp = flowSourceCount(a) - flowSourceCount(b);
        break;
      case "destinations":
        cmp = flowDestinationCount(a) - flowDestinationCount(b);
        break;
      case "frequency":
        cmp = flowFrequencyLabel(a).localeCompare(flowFrequencyLabel(b));
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
  const protocols = new Set<string>();
  const statuses = new Set<string>();
  const owners = new Set<string>();
  for (const item of items) {
    const p = flowProps(item).protocol;
    if (p) protocols.add(p);
    statuses.add(item.status ?? "planned");
    const owner = item.owner?.trim();
    if (owner) owners.add(owner);
  }
  return {
    protocols: [...protocols].sort((a, b) =>
      (PROTOCOL_LABEL[a] ?? a).localeCompare(PROTOCOL_LABEL[b] ?? b)
    ),
    statuses: [...statuses].sort((a, b) => a.localeCompare(b)),
    owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}
