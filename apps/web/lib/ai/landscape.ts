import { AI_FEATURE_CATALOG, AI_JOBS, IMPACT_LANES, RISK_EDGE_TYPES, type AiCatalogEntry, type AiFeature, type AiFeatureStatus } from "@minea/types";
import { annualCost } from "@/lib/cost/service";
import { dollarsFromCents, lineAnnualCents, readCostLines } from "@/lib/cost/math";
import { normalizeTerm } from "@/lib/setup/match-tools";
import { isAiFeatureHost } from "./catalog";
import { readFeatures } from "./features";
import { sensitiveKinds as recordKinds, type SensitiveKind } from "./sensitive";

/** Pure §6 rules for the AI landscape report. No fetching, no dates beyond what is passed in. */

export type LandscapeObject = {
  id: string;
  type: string;
  name: string;
  status?: string | null;
  owner?: string | null;
  owner_team_id?: string | null;
  point_of_contact_id?: string | null;
  properties?: Record<string, unknown> | null;
};
export type LandscapeEdge = { id?: string; type: string; from_object_id: string; to_object_id: string };
export type Severity = "high" | "check";
export type FlagId = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";
export type Lane = "stop" | "slow" | "risk" | null;

export type LandscapeFlag = { id: FlagId; severity: Severity; itemIds: string[]; title: string; why: string; fix: string };

export type FeatureItem = {
  kind: "feature";
  /** `${hostId}:${feature key}` */
  id: string;
  hostId: string;
  hostName: string;
  hostType: string;
  feature: AiFeature;
  entry: AiCatalogEntry | null;
  job: string;
  active: boolean;
  /** Tagged add-on line, dollars a year (0 when none). */
  addOn: number;
};

export type AgentItem = {
  kind: "agent";
  id: string;
  name: string;
  active: boolean;
  status: string;
  job: string;
  builtWith: { id: string; name: string }[];
  models: { id: string; name: string }[];
  reads: { id: string; name: string }[];
  writes: { id: string; name: string }[];
  actsAs: { type: string; name: string } | null;
  autonomy: string;
  owner: string;
  /** Writes something but nobody said whose account it uses. */
  identityGap: boolean;
  cost: number;
};

export type PlatformItem = {
  kind: "platform";
  id: string;
  name: string;
  type: string;
  /** "Model" | "AI platform" | "Runs agents" */
  kindLabel: string;
  /** Low-code / tools that only run agents are listed greyed and not counted. */
  counted: boolean;
  vendor: string;
  usedBy: { id: string; name: string }[];
  vendorTrains: string;
  cost: number;
};

export type UnreviewedRow = { hostId: string; hostName: string; entry: AiCatalogEntry; stored: boolean };

export type AiSpend = { total: number; addOns: number; platforms: number; agents: number };

export type ChainStep = { verb: string; targetId: string | null; targetName: string; lane: Lane; via?: string };

export type AiLandscape = {
  features: FeatureItem[];
  offFeatures: FeatureItem[];
  agents: AgentItem[];
  platforms: PlatformItem[];
  unreviewed: UnreviewedRow[];
  flags: LandscapeFlag[];
  spend: AiSpend;
  places: number;
  highFlags: number;
  chainAgentId: string | null;
};

const ACTIVE_FEATURE: ReadonlySet<AiFeatureStatus> = new Set(["on", "piloting"]);
const ACTIVE_AGENT = new Set(["active", "under_evaluation"]);
const FEEDS = new Set(["sends_data_to", "writes", "owns"]);

const TITLES: Record<FlagId, { title: string; fix: string }> = {
  F1: { title: "Can see customer or financial data", fix: "See what each can see" },
  F2: { title: "Vendor may train on your data", fix: "Get training terms" },
  F3: { title: "Agent has no owner", fix: "Set an owner" },
  F4: { title: "Agent can change data", fix: "Review write access" },
  F5: { title: "Agent uses a person's account", fix: "Switch to a service account" },
  F6: { title: "Two doing the same job", fix: "Compare them" },
};

const COUNT_WORDS: Record<number, string> = { 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six" };

/** F6 title with the group's size: "Two doing the same job", "Three doing the same job". */
export function f6Title(count: number): string {
  return `${COUNT_WORDS[count] ?? String(count)} doing the same job`;
}

/** Header for a group of flags of one kind: the shared title, or a count-free one when F6 groups differ in size. */
export function flagGroupTitle(group: readonly LandscapeFlag[]): string {
  const titles = new Set(group.map((flag) => flag.title));
  if (titles.size === 1) return group[0].title;
  return group[0].id === "F6" ? "Doing the same job" : group[0].title;
}

const KIND_ORDER: SensitiveKind[] = ["customer", "financial", "employee"];

function kindsText(kinds: Set<SensitiveKind>): string {
  return KIND_ORDER.filter((kind) => kinds.has(kind)).join(" and ");
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

type Graph = { byId: Map<string, LandscapeObject>; edges: readonly LandscapeEdge[] };

function graphOf(objects: readonly LandscapeObject[], relationships: readonly LandscapeEdge[]): Graph {
  return { byId: new Map(objects.map((object) => [object.id, object])), edges: relationships };
}

function outOf(graph: Graph, id: string, type: string): LandscapeObject[] {
  return graph.edges
    .filter((edge) => edge.from_object_id === id && edge.type === type)
    .map((edge) => graph.byId.get(edge.to_object_id))
    .filter((object): object is LandscapeObject => Boolean(object))
    .sort(byName);
}

/**
 * §6.2: holds_data when set (["none"] = nothing), else the category / platform default.
 * A data_store without holds_data inherits from what feeds it (sends_data_to / writes / owns), one hop only.
 */
export function sensitiveKinds(
  record: LandscapeObject,
  objects: readonly LandscapeObject[],
  relationships: readonly LandscapeEdge[]
): { kinds: Set<SensitiveKind>; from: LandscapeObject[] } {
  if (record.type !== "data_store" || Array.isArray(record.properties?.holds_data)) return { kinds: recordKinds(record), from: [] };
  const graph = graphOf(objects, relationships);
  const kinds = new Set<SensitiveKind>();
  const from: LandscapeObject[] = [];
  for (const edge of relationships) {
    if (edge.to_object_id !== record.id || !FEEDS.has(edge.type)) continue;
    const source = graph.byId.get(edge.from_object_id);
    if (!source || source.type === "data_store" || source.type === "agent") continue;
    const own = recordKinds(source);
    if (own.size === 0) continue;
    own.forEach((kind) => kinds.add(kind));
    from.push(source);
  }
  return { kinds, from: from.sort(byName) };
}

function isSensitive(kinds: Set<SensitiveKind>): boolean {
  return kinds.has("customer") || kinds.has("financial");
}

function hostAddOn(feature: AiFeature, host: LandscapeObject): number {
  if (!feature.cost_line_id) return 0;
  const line = (readCostLines(host.properties) ?? []).find((item) => item.id === feature.cost_line_id);
  return line ? dollarsFromCents(lineAnnualCents(line)) : 0;
}

function collectFeatures(objects: readonly LandscapeObject[], catalog: readonly AiCatalogEntry[]) {
  const all: FeatureItem[] = [];
  const unreviewed: UnreviewedRow[] = [];
  for (const host of objects) {
    if (!isAiFeatureHost(host)) continue;
    const stored = readFeatures(host.properties);
    for (const feature of stored) {
      const entry = catalog.find((item) => item.key === feature.key) ?? null;
      if (feature.status === "unreviewed") {
        if (entry) unreviewed.push({ hostId: host.id, hostName: host.name, entry, stored: true });
        continue;
      }
      all.push({
        kind: "feature",
        id: `${host.id}:${feature.key}`,
        hostId: host.id,
        hostName: host.name,
        hostType: host.type,
        feature,
        entry,
        job: entry?.job ?? "other",
        active: ACTIVE_FEATURE.has(feature.status),
        addOn: hostAddOn(feature, host),
      });
    }
    const keys = new Set(stored.map((feature) => feature.key));
    for (const entry of hostEntries(host, catalog)) {
      if (!keys.has(entry.key)) unreviewed.push({ hostId: host.id, hostName: host.name, entry, stored: false });
    }
  }
  const order = (a: FeatureItem, b: FeatureItem) => a.hostName.localeCompare(b.hostName) || a.feature.name.localeCompare(b.feature.name);
  unreviewed.sort((a, b) => a.hostName.localeCompare(b.hostName) || a.entry.name.localeCompare(b.entry.name));
  return { features: all.filter((item) => item.active).sort(order), offFeatures: all.filter((item) => !item.active).sort(order), unreviewed };
}

function hostEntries(host: LandscapeObject, catalog: readonly AiCatalogEntry[]): AiCatalogEntry[] {
  const tool = normalizeTerm(str(host.properties?.catalog_tool));
  const name = normalizeTerm(host.name ?? "");
  return catalog.filter((entry) => {
    if (tool && entry.tool && normalizeTerm(entry.tool) === tool) return true;
    return entry.aliases.some((alias) => {
      const term = normalizeTerm(alias);
      return term !== "" && (name === term || name.startsWith(`${term} `));
    });
  });
}

function readActsAs(value: unknown): { type: string; name: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const type = str(item.type);
  if (!type) return null;
  return { type, name: str(item.name) };
}

function ownerOf(object: LandscapeObject, graph: Graph): string {
  const team = object.owner_team_id ? graph.byId.get(object.owner_team_id)?.name : "";
  const person = object.point_of_contact_id ? graph.byId.get(object.point_of_contact_id)?.name : "";
  return team || person || str(object.owner) || (object.owner_team_id || object.point_of_contact_id ? "Owner set" : "");
}

const ref = (object: LandscapeObject) => ({ id: object.id, name: object.name });

function collectAgents(graph: Graph, objects: readonly LandscapeObject[]): AgentItem[] {
  return objects
    .filter((object) => object.type === "agent" && object.status !== "retired")
    .map((object): AgentItem => {
      const props = object.properties ?? {};
      const writes = outOf(graph, object.id, "writes");
      const actsAs = readActsAs(props.acts_as);
      return {
        kind: "agent",
        id: object.id,
        name: object.name,
        status: str(object.status) || "planned",
        active: ACTIVE_AGENT.has(str(object.status)),
        job: str(props.job) || "other",
        builtWith: outOf(graph, object.id, "built_on").map(ref),
        models: outOf(graph, object.id, "uses_model").map(ref),
        reads: outOf(graph, object.id, "reads").map(ref),
        writes: writes.map(ref),
        actsAs,
        autonomy: str(props.autonomy_level),
        owner: ownerOf(object, graph),
        identityGap: writes.length > 0 && !actsAs,
        cost: annualCost(props).run ?? 0,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));
}

function collectPlatforms(graph: Graph, objects: readonly LandscapeObject[], agents: AgentItem[]): PlatformItem[] {
  const builtOn = new Map<string, { id: string; name: string }[]>();
  for (const agent of agents) {
    for (const target of agent.builtWith) builtOn.set(target.id, [...(builtOn.get(target.id) ?? []), { id: agent.id, name: agent.name }]);
  }
  const items: PlatformItem[] = [];
  for (const object of objects) {
    const props = object.properties ?? {};
    const platformType = str(props.platform_type);
    const isModel = object.type === "ai_model";
    const isAiPlatform = object.type === "cloud_service" && platformType === "ai_platform";
    const runsAgents = builtOn.has(object.id);
    if (!isModel && !isAiPlatform && !runsAgents) continue;
    if (platformType === "data_platform") continue;
    const usedBy: { id: string; name: string }[] = [];
    if (isModel) {
      for (const edge of graph.edges) {
        if (edge.type === "uses_model" && edge.to_object_id === object.id) {
          const agent = graph.byId.get(edge.from_object_id);
          if (agent) usedBy.push(ref(agent));
        }
      }
    } else {
      usedBy.push(...(builtOn.get(object.id) ?? []));
      for (const edge of graph.edges) {
        if (edge.type === "runs_on" && edge.to_object_id === object.id) {
          const model = graph.byId.get(edge.from_object_id);
          if (model?.type === "ai_model") usedBy.push(ref(model));
        }
      }
    }
    items.push({
      kind: "platform",
      id: object.id,
      name: object.name,
      type: object.type,
      kindLabel: isModel ? "Model" : isAiPlatform ? "AI platform" : "Runs agents",
      counted: (isModel || isAiPlatform) && object.status !== "retired",
      vendor: str(props.vendor) || str(props.provider),
      usedBy: usedBy.sort(byName),
      vendorTrains: isModel ? str(props.vendor_trains) || "unknown" : "",
      cost: annualCost(props).run ?? 0,
    });
  }
  return items.sort((a, b) => Number(b.counted) - Number(a.counted) || byName(a, b));
}

/** §6.3 F1–F6. */
export function riskFlags(
  objects: readonly LandscapeObject[],
  relationships: readonly LandscapeEdge[],
  features: FeatureItem[],
  agents: AgentItem[]
): LandscapeFlag[] {
  const graph = graphOf(objects, relationships);
  const flags: LandscapeFlag[] = [];
  const push = (id: FlagId, severity: Severity, itemIds: string[], why: string, title?: string) =>
    flags.push({ id, severity, itemIds, why, ...TITLES[id], ...(title ? { title } : {}) });

  for (const item of features) {
    const host = graph.byId.get(item.hostId);
    if (!host) continue;
    const kinds = sensitiveKinds(host, objects, relationships).kinds;
    if (isSensitive(kinds)) {
      if (item.feature.sees_company_data === "yes") push("F1", "high", [item.id], `${item.hostName} holds ${kindsText(kinds)} data and this feature can see it.`);
      else if (item.feature.sees_company_data === "unknown") push("F1", "check", [item.id], `${item.hostName} holds ${kindsText(kinds)} data. Can this feature see it?`);
    }
    if (item.feature.vendor_trains === "yes") push("F2", "high", [item.id], `${item.entry?.vendor ?? item.hostName} says it may train on your data.`);
    else if (item.feature.vendor_trains === "unknown") push("F2", "check", [item.id], `We don't know if ${item.entry?.vendor ?? "the vendor"} trains on your data.`);
  }

  const active = agents.filter((agent) => agent.active);
  for (const agent of active) {
    const touched = [...agent.reads, ...agent.writes];
    const hit = touched
      .map((target) => {
        const object = graph.byId.get(target.id);
        return object ? { object, ...sensitiveKinds(object, objects, relationships) } : null;
      })
      .find((item) => item && isSensitive(item.kinds));
    if (hit) {
      const via = hit.from.length ? ` (it gets data from ${hit.from.map((item) => item.name).join(", ")})` : "";
      push("F1", "high", [agent.id], `It ${agent.writes.some((item) => item.id === hit.object.id) ? "writes to" : "reads"} ${hit.object.name}${via}, which holds ${kindsText(hit.kinds)} data.`);
    }
    for (const model of agent.models) {
      const trains = str(graph.byId.get(model.id)?.properties?.vendor_trains) || "unknown";
      if (trains === "yes") push("F2", "high", [agent.id], `${model.name}'s vendor may train on what this agent sends it.`);
      else if (trains === "unknown") push("F2", "check", [agent.id], `We don't know if ${model.name}'s vendor trains on your data.`);
    }
    if (!agent.owner) push("F3", "high", [agent.id], "Nobody is named as its owner.");
    if (agent.writes.length) {
      const targets = agent.writes.map((item) => item.name).join(", ");
      if (agent.autonomy === "act_autonomously") push("F4", "high", [agent.id], `It writes to ${targets} on its own, with nobody approving.`);
      else if (agent.autonomy === "suggest") push("F4", "high", [agent.id], `It's set to "suggests only" but it has write access to ${targets}.`);
      else if (agent.autonomy === "act_with_approval") push("F4", "check", [agent.id], `It writes to ${targets} once someone approves.`);
      else push("F4", "check", [agent.id], `It writes to ${targets} and its autonomy isn't set.`);
    }
    if (agent.actsAs?.type === "contact") push("F5", "high", [agent.id], `It signs in as ${agent.actsAs.name || "a person"}. If they leave, it stops; and its changes look like theirs.`);
  }

  // F6: same job, ≥2 active items from ≥2 different records (features + agents); "other" ignored.
  const groups = new Map<string, { id: string; record: string; name: string }[]>();
  for (const item of features) groups.set(item.job, [...(groups.get(item.job) ?? []), { id: item.id, record: item.hostId, name: item.feature.name }]);
  for (const agent of active) groups.set(agent.job, [...(groups.get(agent.job) ?? []), { id: agent.id, record: agent.id, name: agent.name }]);
  for (const [job, members] of groups) {
    if (!job || job === "other" || members.length < 2) continue;
    if (new Set(members.map((member) => member.record)).size < 2) continue;
    const label = AI_JOBS.find((item) => item.value === job)?.label.toLowerCase() ?? job;
    push("F6", "check", members.map((member) => member.id), `${members.map((member) => member.name).join(", ")} ${members.length === 2 ? "both" : "all"} do ${label}.`, f6Title(members.length));
  }

  const rank = (flag: LandscapeFlag) => (flag.severity === "high" ? 0 : 1);
  return flags.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/** §6.4: confirmed add-on lines + AI platforms / models + agents' own cost. Unreviewed, data platforms and "runs agents" tools are out. */
export function aiSpend(features: FeatureItem[], agents: AgentItem[], platforms: PlatformItem[]): AiSpend {
  const addOns = features.reduce((sum, item) => sum + item.addOn, 0);
  const platformCost = platforms.filter((item) => item.counted).reduce((sum, item) => sum + item.cost, 0);
  const agentCost = agents.reduce((sum, item) => sum + item.cost, 0);
  return { total: addOns + platformCost + agentCost, addOns, platforms: platformCost, agents: agentCost };
}

export function unreviewed(objects: readonly LandscapeObject[], catalog: readonly AiCatalogEntry[] = AI_FEATURE_CATALOG): UnreviewedRow[] {
  return collectFeatures(objects, catalog).unreviewed;
}

function laneFor(edgeType: string, side: "target" | "source"): Lane {
  if (RISK_EDGE_TYPES.includes(edgeType)) return "risk";
  const rule = IMPACT_LANES[edgeType];
  const effect = side === "target" ? rule?.whenTargetFails : rule?.whenSourceFails;
  if (effect === "direct") return "stop";
  if (effect === "degraded") return "slow";
  return null;
}

/** §6.6 one agent's chain, with lanes from impact-rules.json. */
export function agentChain(agentId: string, objects: readonly LandscapeObject[], relationships: readonly LandscapeEdge[]): ChainStep[] {
  const graph = graphOf(objects, relationships);
  const agent = graph.byId.get(agentId);
  if (!agent) return [];
  const steps: ChainStep[] = [];
  for (const target of outOf(graph, agentId, "built_on")) steps.push({ verb: "Built with", targetId: target.id, targetName: target.name, lane: laneFor("built_on", "target") });
  for (const model of outOf(graph, agentId, "uses_model")) {
    steps.push({ verb: "Uses model", targetId: model.id, targetName: model.name, lane: laneFor("uses_model", "target") });
    for (const host of outOf(graph, model.id, "runs_on")) steps.push({ verb: "Accessed through", targetId: host.id, targetName: host.name, lane: laneFor("runs_on", "target"), via: model.name });
  }
  for (const target of outOf(graph, agentId, "reads")) {
    steps.push({ verb: "Reads", targetId: target.id, targetName: target.name, lane: laneFor("reads", "target") });
    if (target.type === "data_store") {
      for (const edge of relationships) {
        if (edge.to_object_id !== target.id || edge.type !== "sends_data_to") continue;
        const source = graph.byId.get(edge.from_object_id);
        if (source) steps.push({ verb: "Gets data from", targetId: source.id, targetName: source.name, lane: laneFor("sends_data_to", "source"), via: target.name });
      }
    }
  }
  for (const target of outOf(graph, agentId, "writes")) steps.push({ verb: "Writes", targetId: target.id, targetName: target.name, lane: laneFor("writes", "target") });
  const actsAs = readActsAs(agent.properties?.acts_as);
  if (actsAs) steps.push({ verb: "Acts as", targetId: null, targetName: actsAs.name || actsAs.type, lane: null });
  for (const target of outOf(graph, agentId, "can_call")) steps.push({ verb: "Can call", targetId: target.id, targetName: target.name, lane: laneFor("can_call", "target") });
  return steps;
}

export function aiLandscape({
  objects,
  relationships,
  catalog = AI_FEATURE_CATALOG,
}: {
  objects: readonly LandscapeObject[];
  relationships: readonly LandscapeEdge[];
  catalog?: readonly AiCatalogEntry[];
}): AiLandscape {
  const graph = graphOf(objects, relationships);
  const { features, offFeatures, unreviewed: review } = collectFeatures(objects, catalog);
  const agents = collectAgents(graph, objects);
  const platforms = collectPlatforms(graph, objects, agents);
  const flags = riskFlags(objects, relationships, features, agents);
  const activeAgents = agents.filter((agent) => agent.active);
  const counts = new Map<string, number>();
  for (const flag of flags) for (const id of flag.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const chainAgent = [...activeAgents].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || byName(a, b))[0];
  return {
    features,
    offFeatures,
    agents,
    platforms,
    unreviewed: review,
    flags,
    spend: aiSpend(features, activeAgents, platforms),
    places: features.length + activeAgents.length + platforms.filter((item) => item.counted).length,
    highFlags: flags.filter((flag) => flag.severity === "high").length,
    chainAgentId: chainAgent?.id ?? null,
  };
}

/** §8 chip: any agent / AI model / active feature, or at least one catalog suggestion. */
export function hasAiToAskAbout(objects: readonly LandscapeObject[], catalog: readonly AiCatalogEntry[] = AI_FEATURE_CATALOG): boolean {
  if (objects.some((object) => (object.type === "agent" || object.type === "ai_model") && object.status !== "retired")) return true;
  const { features, unreviewed: review } = collectFeatures(objects, catalog);
  return features.length > 0 || review.length > 0;
}
