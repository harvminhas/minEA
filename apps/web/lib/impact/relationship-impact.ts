/**
 * Failure propagation for stored relationship types.
 *
 * Edges are stored once, source → target. Words come from RELATIONSHIP_LABELS.
 * A swap in the dialog stores the flipped ends, not a second edge.
 *
 * Direct (apps that stop) comes only from runs_on, built_on, depends_on,
 * part_of, and located_at. calls and hosts do not propagate as a stop.
 */

import { RELATIONSHIP_LABELS, type RelationshipType } from "@minea/types";

export type ImpactSeverity = "direct" | "degraded" | "loses_support";

export type ImpactRule = {
  /** Failed record is the stored target. The source is affected. */
  whenTargetFails?: ImpactSeverity;
  /** Failed record is the stored source. The target is affected. */
  whenSourceFails?: ImpactSeverity;
  label: (sourceName: string, targetName: string) => string;
  /** Short path phrase, read from the affected item back toward the failed one. */
  step: (sourceName: string, targetName: string) => string;
};

function rule(
  type: RelationshipType,
  severity: { whenTargetFails?: ImpactSeverity; whenSourceFails?: ImpactSeverity }
): ImpactRule {
  const words = RELATIONSHIP_LABELS[type];
  return {
    ...severity,
    label: (source, target) => words.sentence(source, target),
    step: (source, target) =>
      severity.whenSourceFails && !severity.whenTargetFails
        ? `${words.reverse} ${source}`
        : `${words.forward} ${target}`,
  };
}

export const relationshipImpactRules: Record<string, ImpactRule> = {
  depends_on: rule("depends_on", { whenTargetFails: "direct" }),
  part_of: rule("part_of", { whenTargetFails: "direct", whenSourceFails: "degraded" }),
  runs_on: rule("runs_on", { whenTargetFails: "direct" }),
  built_on: rule("built_on", { whenTargetFails: "direct" }),
  located_at: rule("located_at", { whenTargetFails: "direct" }),
  sends_data_to: rule("sends_data_to", { whenSourceFails: "degraded" }),
  reads: rule("reads", { whenTargetFails: "degraded" }),
  writes: rule("writes", { whenTargetFails: "degraded" }),
  owns: rule("owns", { whenTargetFails: "degraded" }),
  creates: rule("creates", { whenTargetFails: "degraded" }),
  updates: rule("updates", { whenTargetFails: "degraded" }),
  supported_by: rule("supported_by", { whenTargetFails: "loses_support" }),
  supports: rule("supports", { whenSourceFails: "loses_support" }),
  replaces: rule("replaces", {}),
};

export const impactSectionTitle: Record<ImpactSeverity, string> = {
  direct: "Stops working",
  degraded: "Degraded",
  loses_support: "Loses support",
};

export type ImpactNode = { id: string; name: string; typeLabel?: string };

export type ImpactEdge = {
  type: string;
  fromId: string;
  toId: string;
};

export type ImpactStep = {
  type: string;
  fromId: string;
  toId: string;
  label: string;
};

export type ImpactHit = {
  id: string;
  name: string;
  severity: ImpactSeverity;
  /** True when the effect is more than one step from the failed record. */
  indirect: boolean;
  depth: number;
  path: ImpactStep[];
};

const MAX_DEPTH = 4;

const SEVERITY_ORDER: Record<ImpactSeverity, number> = {
  direct: 0,
  degraded: 1,
  loses_support: 2,
};

export function impactOf(nodes: ImpactNode[], edges: ImpactEdge[], failedId: string): ImpactHit[] {
  const names = new Map(nodes.map((node) => [node.id, node.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const unique = dedupeEdges(edges);
  const adjacent = new Map<string, ImpactEdge[]>();
  for (const edge of unique) {
    push(adjacent, edge.fromId, edge);
    if (edge.toId !== edge.fromId) push(adjacent, edge.toId, edge);
  }
  for (const list of adjacent.values()) {
    list.sort((a, b) => a.type.localeCompare(b.type) || a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId));
  }

  const hits = new Map<string, ImpactHit>();
  const seen = new Set<string>([failedId]);
  const queue: { id: string; depth: number; path: ImpactStep[] }[] = [{ id: failedId, depth: 0, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= MAX_DEPTH) continue;
    for (const edge of adjacent.get(current.id) ?? []) {
      const rule = relationshipImpactRules[edge.type];
      if (!rule) continue;
      let affectedId = "";
      let severity: ImpactSeverity | undefined;
      if (edge.toId === current.id && rule.whenTargetFails) {
        affectedId = edge.fromId;
        severity = rule.whenTargetFails;
      } else if (edge.fromId === current.id && rule.whenSourceFails) {
        affectedId = edge.toId;
        severity = rule.whenSourceFails;
      }
      if (!severity || !affectedId || affectedId === current.id || seen.has(affectedId)) continue;
      seen.add(affectedId);
      const step: ImpactStep = {
        type: edge.type,
        fromId: edge.fromId,
        toId: edge.toId,
        label: rule.label(nameOf(edge.fromId), nameOf(edge.toId)),
      };
      const path = [...current.path, step];
      const depth = current.depth + 1;
      hits.set(affectedId, {
        id: affectedId,
        name: nameOf(affectedId),
        severity,
        indirect: depth > 1,
        depth,
        path,
      });
      queue.push({ id: affectedId, depth, path });
    }
  }

  return [...hits.values()].sort(
    (a, b) => a.depth - b.depth || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.name.localeCompare(b.name)
  );
}

/** Path in plain words, from the affected item back to the failed one. Phrases come from the rules. */
export function connectionPhrase(hit: ImpactHit, nodes: ImpactNode[]): string {
  const names = new Map(nodes.map((node) => [node.id, node.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const phrases = [...hit.path].reverse().map((step) => {
    const rule = relationshipImpactRules[step.type];
    return rule ? rule.step(nameOf(step.fromId), nameOf(step.toId)) : step.label;
  });
  if (phrases.length === 0) return "";
  return phrases
    .map((phrase, index) => (index === 0 ? phrase : phrase.charAt(0).toLowerCase() + phrase.slice(1)))
    .join(" → ");
}

export function groupImpactHits(hits: ImpactHit[]): { title: string; severity: ImpactSeverity; hits: ImpactHit[] }[] {
  const order: ImpactSeverity[] = ["direct", "degraded", "loses_support"];
  return order
    .map((severity) => ({
      title: impactSectionTitle[severity],
      severity,
      hits: hits.filter((hit) => hit.severity === severity),
    }))
    .filter((group) => group.hits.length > 0);
}

export function impactReachLabel(hit: ImpactHit): string {
  if (hit.severity === "loses_support") return "Loses support";
  if (hit.severity === "degraded") return "Degraded";
  return hit.indirect ? "Indirect" : "Direct";
}

function dedupeEdges(edges: ImpactEdge[]): ImpactEdge[] {
  const seen = new Set<string>();
  const out: ImpactEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.type}|${edge.fromId}|${edge.toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

function push(map: Map<string, ImpactEdge[]>, id: string, edge: ImpactEdge) {
  const list = map.get(id);
  if (list) list.push(edge);
  else map.set(id, [edge]);
}

export type ImpactRecord = {
  id: string;
  name: string;
  typeLabel: string;
  owner: string;
  criticality: string;
  annualCost: string | null;
  renewal: string | null;
  missingOwner: boolean;
  missingCriticality: boolean;
  hostingModel: string;
};

export type ImpactRow = {
  n: number;
  hit: ImpactHit;
  record: ImpactRecord;
  connection: string;
  severity: ImpactSeverity;
  section: string;
};

export type ImpactPresentation = {
  sentence: string;
  context: string;
  rows: ImpactRow[];
  gaps: string[];
  followUps: string[];
};

export function presentImpact(input: {
  source: ImpactRecord;
  records: ImpactRecord[];
  nodes: ImpactNode[];
  edges: ImpactEdge[];
}): ImpactPresentation {
  const hits = impactOf(input.nodes, input.edges, input.source.id);
  const byId = new Map(input.records.map((record) => [record.id, record]));
  const recordFor = (hit: ImpactHit): ImpactRecord =>
    byId.get(hit.id) ?? {
      id: hit.id,
      name: hit.name,
      typeLabel: input.nodes.find((node) => node.id === hit.id)?.typeLabel || "Item",
      owner: "",
      criticality: "",
      annualCost: null,
      renewal: null,
      missingOwner: true,
      missingCriticality: true,
      hostingModel: "",
    };

  let n = 2;
  const rows: ImpactRow[] = groupImpactHits(hits).flatMap((group) =>
    group.hits.map((hit) => ({
      n: n++,
      hit,
      record: recordFor(hit),
      connection: connectionPhrase(hit, input.nodes),
      severity: hit.severity,
      section: group.title,
    }))
  );

  const direct = rows.filter((row) => row.severity === "direct");
  const degraded = rows.filter((row) => row.severity === "degraded");
  const support = rows.filter((row) => row.severity === "loses_support");
  const clauses = [
    clause(direct, "stops working", "stop working"),
    clause(degraded, "is degraded", "are degraded"),
    clause(support, "loses support", "lose support"),
  ].filter(Boolean);
  const sentence = clauses.length
    ? `If ${input.source.name} [1] goes down, ${clauses.join(" and ")}.`
    : `Nothing in your model depends on ${input.source.name} [1].`;

  return {
    sentence,
    context: sourceContext(input.source),
    rows,
    gaps: impactGaps(input.source, rows.map((row) => row.record), input.edges),
    followUps: [
      `What does ${input.source.name} cost us?`,
      `Who owns ${(direct[0] ?? rows[0])?.record.name || input.source.name}?`,
      `What connects to ${input.source.name} through integrations?`,
    ],
  };
}

function clause(rows: ImpactRow[], singular: string, plural: string): string {
  if (!rows.length) return "";
  return `${nameList(rows.map((row) => row.record.name))} ${rows.length === 1 ? singular : plural}`;
}

function nameList(names: string[]): string {
  if (names.length <= 3) {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names[0]}, ${names[1]}, and ${names[2]}`;
  }
  return `${names[0]}, ${names[1]}, ${names[2]}, and ${names.length - 3} more`;
}

function sourceContext(source: ImpactRecord): string {
  const parts: string[] = [];
  if (source.owner) parts.push(`Owner ${source.owner}`);
  parts.push(source.criticality ? `Criticality ${source.criticality}` : "Criticality not set");
  if (source.annualCost) parts.push(source.annualCost);
  if (source.renewal) parts.push(`renews ${source.renewal}`);
  return parts.join(" · ");
}

function impactGaps(source: ImpactRecord, affected: ImpactRecord[], edges: ImpactEdge[]): string[] {
  const gaps: string[] = [];
  for (const record of [source, ...affected]) {
    const bits = [record.missingOwner ? "no owner" : "", record.missingCriticality ? "no criticality" : ""].filter(Boolean);
    if (bits.length) gaps.push(`${record.name} has ${bits.join(" and ")}.`);
  }
  const touches = (type: string) => edges.some((edge) => edge.type === type && (edge.fromId === source.id || edge.toId === source.id));
  if (!touches("sends_data_to")) {
    gaps.push(`No integrations are recorded for ${source.name}, so systems that call it through an API may be missing.`);
  }
  if (source.hostingModel && !touches("runs_on") && !touches("built_on")) {
    gaps.push(`${source.name} has no host linked.`);
  }
  return gaps;
}
