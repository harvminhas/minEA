import { flowProps } from "@/lib/flow-list-utils";
import {
  FLOW_MANUAL_TRIGGER_LABEL,
  flowFromLine,
  flowManualOwnerCaption,
  flowMechanismLabel,
  flowToLine,
  isFlowSystemEndpointKind,
} from "@/lib/flow-utils";
import type { FlowMechanism, MinEAObject } from "@minea/types";

export const INTEGRATION_TECH_EXPOSURE_CAPTION =
  "\"No tooling / ad hoc\" and \"single point of failure\" describe structural exposure, not business impact — a flagged item may or may not be business-critical.";

export const INTEGRATION_TECH_PANEL_CAPTION =
  "Structural exposure, not business impact — this flow may or may not be business-critical.";

export interface IntegrationTechFlowEntry {
  flow: MinEAObject;
  pillLabel: string;
  toolKey: string | null;
}

export interface IntegrationTechGroup {
  key: string;
  label: string;
  variant: "default" | "custom" | "muted";
  sortOrder: number;
  flows: IntegrationTechFlowEntry[];
}

export interface IntegrationTechSummary {
  flowsMapped: number;
  manualFlowCount: number;
  fileBasedFlowCount: number;
  singlePointOfFailureToolCount: number;
}

export interface SpofPairEvidence {
  pairKey: string;
  fromLabel: string;
  toLabel: string;
  flow: MinEAObject;
  mechanismLabel: string;
  platformLabel?: string;
  carrierLabel?: string;
  flowNote?: string;
  explanation: string;
}

export interface SpofToolEvidence {
  toolKey: string;
  toolName: string;
  pairs: SpofPairEvidence[];
}

export interface ManualFlowEvidence {
  flow: MinEAObject;
  connectionLabel: string;
  owner: string;
  trigger: string;
}

const MECHANISM_GROUP: Partial<
  Record<FlowMechanism, { key: string; label: string; sortOrder: number; variant: "default" | "custom" }>
> = {
  api_realtime: { key: "api_realtime", label: "DIRECT API", sortOrder: 10, variant: "default" },
  event_driven: { key: "event_driven", label: "EVENT-DRIVEN", sortOrder: 20, variant: "default" },
  batch_scheduled: {
    key: "batch_scheduled",
    label: "SCHEDULER / CRON",
    sortOrder: 30,
    variant: "default",
  },
  file_based: { key: "file_based", label: "FILE-BASED", sortOrder: 40, variant: "default" },
  manual: { key: "manual", label: "NO TOOLING / AD HOC", sortOrder: 90, variant: "custom" },
};

function pairKey(fromId: string, toId: string): string {
  return `${fromId}→${toId}`;
}

/** Normalized system-to-system pairs for a flow (v2 from/to or legacy sides). */
export function flowSystemPairKeys(flow: MinEAObject): string[] {
  const props = flowProps(flow);
  const pairs: string[] = [];

  if (
    props.from &&
    props.to &&
    isFlowSystemEndpointKind(props.from.endpoint_kind) &&
    isFlowSystemEndpointKind(props.to.endpoint_kind)
  ) {
    pairs.push(pairKey(props.from.endpoint_id, props.to.endpoint_id));
    return pairs;
  }

  for (const src of props.sources?.systems ?? []) {
    for (const dst of props.destinations?.systems ?? []) {
      pairs.push(pairKey(src.system_id, dst.system_id));
    }
  }

  return pairs;
}

/** Tool identity for no-code/iPaaS (platform field) or linked integration infrastructure. */
export function flowIntegrationToolKey(flow: MinEAObject): string | null {
  const props = flowProps(flow);

  if (props.mechanism === "no_code_ipaas") {
    const platform = props.platform?.trim() || "Unnamed iPaaS";
    return `platform:${platform.toLowerCase()}`;
  }

  if (props.carrier?.carrier_id) {
    return `carrier:${props.carrier.carrier_id}`;
  }

  return null;
}

function buildPairFlowMap(flows: MinEAObject[]): Map<string, MinEAObject[]> {
  const pairFlows = new Map<string, MinEAObject[]>();

  for (const flow of flows) {
    for (const pair of flowSystemPairKeys(flow)) {
      const list = pairFlows.get(pair) ?? [];
      list.push(flow);
      pairFlows.set(pair, list);
    }
  }

  return pairFlows;
}

/** Distinct tools that are the only path for at least one From → To system pair. */
export function computeSinglePointOfFailureToolKeys(flows: MinEAObject[]): Set<string> {
  const spof = new Set<string>();
  const pairFlows = buildPairFlowMap(flows);

  for (const flow of flows) {
    const toolKey = flowIntegrationToolKey(flow);
    if (!toolKey) continue;

    for (const pair of flowSystemPairKeys(flow)) {
      const peers = pairFlows.get(pair) ?? [];
      const alternatePaths = peers.filter((peer) => {
        if (peer.id === flow.id) return false;
        return flowIntegrationToolKey(peer) !== toolKey;
      });

      if (alternatePaths.length === 0) {
        spof.add(toolKey);
        break;
      }
    }
  }

  return spof;
}

export function flowIntegrationToolName(flow: MinEAObject): string {
  const props = flowProps(flow);
  if (props.mechanism === "no_code_ipaas") {
    return props.platform?.trim() || "Unnamed iPaaS";
  }
  if (props.carrier?.carrier_name?.trim()) {
    return props.carrier.carrier_name.trim();
  }
  return "Integration tool";
}

function flowPairLabels(flow: MinEAObject, pair: string): { from: string; to: string } {
  const props = flowProps(flow);

  if (
    props.from &&
    props.to &&
    isFlowSystemEndpointKind(props.from.endpoint_kind) &&
    isFlowSystemEndpointKind(props.to.endpoint_kind)
  ) {
    return { from: flowFromLine(props), to: flowToLine(props) };
  }

  const [fromId, toId] = pair.split("→");
  const src = props.sources?.systems?.find((s) => s.system_id === fromId);
  const dst = props.destinations?.systems?.find((s) => s.system_id === toId);
  return {
    from: src?.system_name ?? fromId ?? "—",
    to: dst?.system_name ?? toId ?? "—",
  };
}

function flowDescriptionNote(flow: MinEAObject): string | undefined {
  const desc = flow.description?.trim();
  if (!desc) return undefined;
  const first = desc.split(/[.!?\n]/)[0]?.trim();
  if (!first) return undefined;
  if (first.length <= 96) return first;
  return `${first.slice(0, 93)}…`;
}

function spofExplanation(from: string, to: string, toolName: string): string {
  return `No other flow connects ${from} to ${to}. If ${toolName} fails, this connection has no fallback.`;
}

function isSpofForPair(
  flow: MinEAObject,
  pair: string,
  toolKey: string,
  pairFlows: Map<string, MinEAObject[]>
): boolean {
  const peers = pairFlows.get(pair) ?? [];
  const alternatePaths = peers.filter((peer) => {
    if (peer.id === flow.id) return false;
    return flowIntegrationToolKey(peer) !== toolKey;
  });
  return alternatePaths.length === 0;
}

/** Evidence rows for the SPOF stat drill-down — one section per tool, one row per affected pair. */
export function buildSpofToolEvidence(flows: MinEAObject[]): SpofToolEvidence[] {
  const pairFlows = buildPairFlowMap(flows);
  const byTool = new Map<string, SpofToolEvidence>();

  for (const flow of flows) {
    const toolKey = flowIntegrationToolKey(flow);
    if (!toolKey) continue;

    const toolName = flowIntegrationToolName(flow);
    const props = flowProps(flow);

    for (const pair of flowSystemPairKeys(flow)) {
      if (!isSpofForPair(flow, pair, toolKey, pairFlows)) continue;

      const labels = flowPairLabels(flow, pair);
      const evidence: SpofPairEvidence = {
        pairKey: pair,
        fromLabel: labels.from,
        toLabel: labels.to,
        flow,
        mechanismLabel: flowMechanismLabel(props),
        platformLabel: props.platform?.trim() || undefined,
        carrierLabel: props.carrier?.carrier_name?.trim() || undefined,
        flowNote: flowDescriptionNote(flow),
        explanation: spofExplanation(labels.from, labels.to, toolName),
      };

      let tool = byTool.get(toolKey);
      if (!tool) {
        tool = { toolKey, toolName, pairs: [] };
        byTool.set(toolKey, tool);
      }

      if (!tool.pairs.some((p) => p.pairKey === pair && p.flow.id === flow.id)) {
        tool.pairs.push(evidence);
      }
    }
  }

  return [...byTool.values()]
    .map((tool) => ({
      ...tool,
      pairs: [...tool.pairs].sort((a, b) => {
        const conn = `${a.fromLabel} → ${a.toLabel}`.localeCompare(`${b.fromLabel} → ${b.toLabel}`);
        if (conn !== 0) return conn;
        return a.flow.name.localeCompare(b.flow.name);
      }),
    }))
    .sort((a, b) => a.toolName.localeCompare(b.toolName));
}

/** Evidence rows for the manual / ad hoc stat drill-down. */
export function buildManualFlowEvidence(flows: MinEAObject[]): ManualFlowEvidence[] {
  return flows
    .filter((f) => flowProps(f).mechanism === "manual")
    .map((flow) => {
      const props = flowProps(flow);
      return {
        flow,
        connectionLabel: `${flowFromLine(props)} → ${flowToLine(props)}`,
        owner: flowManualOwnerCaption(flow) || flow.owner?.trim() || "—",
        trigger: props.manual_trigger
          ? FLOW_MANUAL_TRIGGER_LABEL[props.manual_trigger]
          : "—",
      };
    })
    .sort((a, b) => a.flow.name.localeCompare(b.flow.name));
}

function flowExtraNote(flow: MinEAObject): string | undefined {
  const props = flowProps(flow);
  const desc = flow.description?.trim();
  if (desc) {
    const first = desc.split(/[.!?\n]/)[0]?.trim();
    if (first && first.length <= 64) return first;
    if (first) return `${first.slice(0, 61)}…`;
  }

  if (props.mechanism === "manual") {
    const owner = flowManualOwnerCaption(flow);
    return owner ? `manual, ${owner}` : "manual";
  }

  if (props.mechanism === "batch_scheduled" || props.mechanism === "file_based") {
    return props.schedule?.trim() || "unmonitored";
  }

  return undefined;
}

export function flowIntegrationPillLabel(flow: MinEAObject): string {
  const props = flowProps(flow);
  const parts = [flow.name];
  const from = flowFromLine(props);
  const to = flowToLine(props);
  if (from !== "—" || to !== "—") {
    parts.push(`${from} → ${to}`);
  }
  const extra = flowExtraNote(flow);
  if (extra) parts.push(extra);
  return parts.join(" · ");
}

function integrationGroupMeta(
  flow: MinEAObject,
  spofToolKeys: Set<string>
): {
  key: string;
  label: string;
  variant: "default" | "custom" | "muted";
  sortOrder: number;
  toolKey: string | null;
} {
  const props = flowProps(flow);
  const mechanism = props.mechanism ?? (props.protocol as FlowMechanism | undefined);
  const toolKey = flowIntegrationToolKey(flow);

  if (mechanism === "no_code_ipaas") {
    const platform = props.platform?.trim() || "Unnamed iPaaS";
    const label = `${platform.toUpperCase()} (IPAAS)`;
    const key = `no_code:${platform.toLowerCase()}`;
    const isSpof = toolKey ? spofToolKeys.has(toolKey) : false;
    return {
      key,
      label,
      variant: isSpof ? "custom" : "default",
      sortOrder: 50,
      toolKey,
    };
  }

  if (toolKey?.startsWith("carrier:")) {
    const name = props.carrier?.carrier_name?.trim() || "Integration infrastructure";
    const isSpof = spofToolKeys.has(toolKey);
    return {
      key: toolKey,
      label: name.toUpperCase(),
      variant: isSpof ? "custom" : "default",
      sortOrder: 60,
      toolKey,
    };
  }

  if (mechanism && MECHANISM_GROUP[mechanism]) {
    const meta = MECHANISM_GROUP[mechanism]!;
    return { ...meta, toolKey: null };
  }

  if (mechanism) {
    return {
      key: mechanism,
      label: flowMechanismLabel(props).toUpperCase(),
      variant: "default",
      sortOrder: 80,
      toolKey: null,
    };
  }

  return {
    key: "not_set",
    label: "NOT SET",
    variant: "muted",
    sortOrder: 999,
    toolKey: null,
  };
}

export function buildIntegrationTechGroups(flows: MinEAObject[]): IntegrationTechGroup[] {
  const spofToolKeys = computeSinglePointOfFailureToolKeys(flows);
  const byKey = new Map<string, IntegrationTechGroup>();

  for (const flow of flows) {
    const meta = integrationGroupMeta(flow, spofToolKeys);
    const entry: IntegrationTechFlowEntry = {
      flow,
      pillLabel: flowIntegrationPillLabel(flow),
      toolKey: meta.toolKey,
    };

    const existing = byKey.get(meta.key);
    if (existing) {
      existing.flows.push(entry);
    } else {
      byKey.set(meta.key, {
        key: meta.key,
        label: meta.label,
        variant: meta.variant,
        sortOrder: meta.sortOrder,
        flows: [entry],
      });
    }
  }

  return [...byKey.values()]
    .map((group) => ({
      ...group,
      flows: [...group.flows].sort((a, b) => a.flow.name.localeCompare(b.flow.name)),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}

export function summarizeIntegrationTech(flows: MinEAObject[]): IntegrationTechSummary {
  const manualFlowCount = flows.filter((f) => flowProps(f).mechanism === "manual").length;
  const fileBasedFlowCount = flows.filter((f) => flowProps(f).mechanism === "file_based").length;
  const spofToolKeys = computeSinglePointOfFailureToolKeys(flows);

  return {
    flowsMapped: flows.length,
    manualFlowCount,
    fileBasedFlowCount,
    singlePointOfFailureToolCount: spofToolKeys.size,
  };
}

export function integrationTechGroupHeading(group: IntegrationTechGroup): string {
  const count = group.flows.length;
  return `${group.label} · ${count} ${count === 1 ? "FLOW" : "FLOWS"}`;
}
