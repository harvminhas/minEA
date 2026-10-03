import { runDollarsTotal } from "@/lib/cost/service";
import { impactOf, type ImpactEdge, type ImpactHit, type ImpactNode } from "@/lib/impact/relationship-impact";
import { readRuntimeInfra } from "@/lib/infra/read";
import { infraStatus } from "@/lib/infra/status";

export type ChainKind = "application" | "runtime" | "platform" | "location" | "capability" | "other";

export type ChainItem = {
  id: string;
  name: string;
  kind: ChainKind;
  ownerTeam: string;
  criticality: string;
  description: string;
  properties: Record<string, unknown>;
};

export type Candidate = {
  id: string;
  name: string;
  kind: ChainKind;
  reached: number;
  apps: number;
  teams: number;
  direct: number;
  degraded: number;
  losesSupport: number;
};

export type ChainTodo = {
  id: string;
  recordId: string;
  title: string;
  body: string;
  action: string;
};

const CANDIDATE_KINDS = new Set<ChainKind>(["platform", "runtime", "location"]);

export function impactCandidates(items: ChainItem[], nodes: ImpactNode[], edges: ImpactEdge[]): Candidate[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items
    .filter((item) => CANDIDATE_KINDS.has(item.kind))
    .map((item) => {
      const hits = impactOf(nodes, edges, item.id);
      const apps = hits.filter((hit) => byId.get(hit.id)?.kind === "application");
      const teams = new Set(apps.map((hit) => byId.get(hit.id)?.ownerTeam).filter((name): name is string => Boolean(name)));
      return {
        id: item.id,
        name: item.name,
        kind: item.kind,
        reached: hits.length,
        apps: apps.length,
        teams: teams.size,
        direct: hits.filter((hit) => hit.severity === "direct").length,
        degraded: hits.filter((hit) => hit.severity === "degraded").length,
        losesSupport: hits.filter((hit) => hit.severity === "loses_support").length,
      };
    })
    .sort((a, b) => b.reached - a.reached || b.apps - a.apps || a.name.localeCompare(b.name));
}

export function openingCards(candidates: Candidate[]): Candidate[] {
  return candidates.slice(0, 6);
}

/** ?sel wins when that id exists. Otherwise the first ranked candidate. */
export function resolveSelection(explicit: string | null | undefined, candidates: Candidate[], knownIds: Set<string>): string {
  if (explicit && knownIds.has(explicit)) return explicit;
  return candidates[0]?.id ?? "";
}

/** A location that holds one item opens on that item. An explicit selection stays. */
export function replaceLoneLocation(selectedId: string, explicit: boolean, edges: ImpactEdge[]): string {
  if (explicit || !selectedId) return selectedId;
  const held = edges.filter((edge) => edge.type === "located_at" && edge.toId === selectedId);
  return held.length === 1 ? held[0]!.fromId : selectedId;
}

export function spofCaption(candidate: Candidate | undefined, showingDefault: boolean): string {
  if (!showingDefault || !candidate) return "";
  const apps = candidate.apps === 1 ? "1 app" : `${candidate.apps} apps`;
  const teams = candidate.teams === 1 ? "1 team" : `${candidate.teams} teams`;
  return `Your biggest single point of failure: ${apps} and ${teams} depend on it.`;
}

export function groupChain(hits: ImpactHit[], kindOf: (id: string) => ChainKind) {
  const stop: ImpactHit[] = [];
  const slow: ImpactHit[] = [];
  const capabilities: ImpactHit[] = [];
  const infra: ImpactHit[] = [];
  for (const hit of hits) {
    const kind = kindOf(hit.id);
    if (hit.severity === "loses_support" || kind === "capability") capabilities.push(hit);
    else if (kind === "application" && hit.severity === "degraded") slow.push(hit);
    else if (kind === "application") stop.push(hit);
    else if (kind === "runtime" || kind === "platform") infra.push(hit);
    else capabilities.push(hit);
  }
  return { stop, slow, capabilities, infra };
}

export function chainRunDollars(selected: ChainItem | undefined, hits: ImpactHit[], items: ChainItem[]): number {
  if (!selected) return 0;
  const grouped = groupChain(hits, (id) => items.find((item) => item.id === id)?.kind ?? "other");
  const ids = new Set<string>([selected.id, ...grouped.stop.map((hit) => hit.id), ...grouped.slow.map((hit) => hit.id), ...grouped.infra.map((hit) => hit.id)]);
  return runDollarsTotal(items.filter((item) => ids.has(item.id)).map((item) => item.properties));
}

export function collapsedCopy(lane: "capabilities" | "slow" | "stop" | "infra", count: number): string {
  if (count > 0) return "";
  if (lane === "capabilities") return "No capabilities linked yet";
  if (lane === "slow") return "No app depends on these yet";
  if (lane === "stop") return "No app runs on it yet";
  return "Nothing else runs on it";
}

export function laneDelayMs(fromBottom: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return fromBottom * 200;
}

export const viewsMotionCss = `
@keyframes viewsLaneIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes viewsEdgeIn { from { opacity: 0; } to { opacity: 1; } }
.views-lane-in { animation: viewsLaneIn 280ms ease both; }
.views-edge-in { animation: viewsEdgeIn 280ms ease both; }
@media (prefers-reduced-motion: reduce) {
  .views-lane-in, .views-edge-in { animation: none; }
}
`;

export type ViewBadge = { tab: "impact" | "flow" | "hosting" | "protection"; label: string };

export function viewBadges(counts: { spof: number; manual: number; noHome: number; noBackup: number }, hide: boolean): ViewBadge[] {
  if (hide) return [];
  const badges: ViewBadge[] = [];
  if (counts.spof > 0) badges.push({ tab: "impact", label: `${counts.spof} SPOF` });
  if (counts.manual > 0) badges.push({ tab: "flow", label: `${counts.manual} manual` });
  if (counts.noHome > 0) badges.push({ tab: "hosting", label: `${counts.noHome} with no home` });
  if (counts.noBackup > 0) badges.push({ tab: "protection", label: `${counts.noBackup} with no backup` });
  return badges;
}

export function manualFlowCount(edges: { type: string; how?: string }[]): number {
  return edges.filter((edge) => edge.type === "sends_data_to" && edge.how === "manual").length;
}

export function backupGapCount(items: ChainItem[], edges: ImpactEdge[]): number {
  const backed = new Set(edges.filter((edge) => edge.type === "backed_up_to").map((edge) => edge.fromId));
  return items.filter((item) => item.kind === "runtime" && !isCloudRuntime(item) && !backed.has(item.id)).length;
}

export function showExampleEstate(hostEdges: number, demoEmpty: boolean, dev: boolean): boolean {
  if (hostEdges === 0) return true;
  return dev && demoEmpty;
}

export function chainTodos(selected: ChainItem | undefined, hits: ImpactHit[], items: ChainItem[], edges: ImpactEdge[], today = new Date()): ChainTodo[] {
  if (!selected) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const grouped = groupChain(hits, (id) => byId.get(id)?.kind ?? "other");
  const chainIds = new Set<string>([selected.id, ...hits.map((hit) => hit.id)]);
  const chainItems = items.filter((item) => chainIds.has(item.id));
  const chainNames = chainItems.map((item) => item.name).filter((name) => name.length >= 3);
  const owners: ChainTodo[] = [];
  const support: ChainTodo[] = [];
  const os: ChainTodo[] = [];
  const hosts: ChainTodo[] = [];
  const criticality: ChainTodo[] = [];
  const backups: ChainTodo[] = [];

  for (const hit of [...grouped.stop, ...grouped.slow]) {
    const app = byId.get(hit.id);
    if (!app || app.ownerTeam) continue;
    owners.push({
      id: `owner:${app.id}`,
      recordId: app.id,
      title: `${app.name} has no owner`,
      body: "Nobody to call when it stops.",
      action: "Set owner",
    });
  }

  for (const item of chainItems.filter((entry) => entry.kind === "runtime")) {
    const runtime = readRuntimeInfra({ id: item.id, name: item.name, properties: item.properties });
    const status = infraStatus(runtime, today);
    if (status.status === "out_of_support" && status.effectiveDate) {
      support.push({
        id: `support:${item.id}`,
        recordId: item.id,
        title: `${item.name} out of support since ${monthYear(status.effectiveDate)}`,
        body: status.reason,
        action: "Plan replacement",
      });
    }
    if (status.status === "unsupported_os") {
      os.push({
        id: `os:${item.id}`,
        recordId: item.id,
        title: `${item.name} runs an unsupported OS`,
        body: status.reason,
        action: "Plan upgrade",
      });
    }
    if (!isCloudRuntime(item) && !edges.some((edge) => edge.type === "backed_up_to" && edge.fromId === item.id)) {
      backups.push({
        id: `backup:${item.id}`,
        recordId: item.id,
        title: `${item.name} has no backup recorded`,
        body: "Nothing is recorded as holding its backups.",
        action: "Add backup",
      });
    }
  }

  for (const app of items.filter((item) => item.kind === "application")) {
    const hosting = String(app.properties.hosting_model ?? "");
    const onPrem = hosting === "on_premise" || hosting === "hybrid";
    const linked = edges.some((edge) => edge.fromId === app.id && (edge.type === "runs_on" || edge.type === "built_on"));
    const note = `${app.description} ${String(app.properties.location ?? "")}`.toLowerCase();
    const namesChain = chainNames.some((name) => name.toLowerCase() !== app.name.toLowerCase() && note.includes(name.toLowerCase()));
    if (onPrem && !linked && namesChain) {
      hosts.push({
        id: `host:${app.id}`,
        recordId: app.id,
        title: `${app.name} has no host`,
        body: "Probably on a machine in this chain.",
        action: "Add host",
      });
    }
  }

  for (const hit of [...grouped.stop, ...grouped.slow]) {
    const app = byId.get(hit.id);
    if (!app || app.criticality) continue;
    criticality.push({
      id: `criticality:${app.id}`,
      recordId: app.id,
      title: `${app.name} has no criticality`,
      body: "Set how bad it is if this stops.",
      action: "Set criticality",
    });
  }

  const team = [...grouped.stop, ...grouped.slow].map((hit) => byId.get(hit.id)?.ownerTeam).find((name) => Boolean(name)) ?? "the team";
  return [
    ...owners,
    ...support,
    ...os,
    ...hosts,
    ...criticality,
    ...backups,
    {
      id: "confirm",
      recordId: selected.id,
      title: "Is this list complete?",
      body: `Check with ${team} that nothing else depends on ${selected.name}.`,
      action: "Confirm",
    },
  ];
}

function monthYear(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isCloudRuntime(item: ChainItem): boolean {
  const kind = String(item.properties.runtime_kind ?? item.properties.compute_runtime_kind ?? "");
  return kind === "cloud_service" || kind === "serverless" || kind === "paas";
}
