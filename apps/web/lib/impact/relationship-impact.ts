/**
 * Failure propagation for stored relationship types.
 *
 * Edges are stored once, source → target. Words come from RELATIONSHIP_LABELS.
 * A swap in the dialog stores the flipped ends, not a second edge.
 *
 * Direct (apps that stop) comes only from runs_on, built_on, depends_on,
 * part_of, and located_at. calls and hosts do not propagate as a stop.
 *
 * authenticates_via gives "Can't sign in" (loses_sign_in). It is terminal: the
 * app is still running, so nothing that depends on it is hit through it.
 * When one item is reached by several links, the worst lane wins.
 */

import { IMPACT_LANES, RELATIONSHIP_LABELS, TERMINAL_IMPACT_SEVERITIES, type RelationshipType } from "@minea/types";

export type ImpactSeverity = "direct" | "loses_sign_in" | "degraded" | "loses_support";

const TERMINAL = new Set<ImpactSeverity>(TERMINAL_IMPACT_SEVERITIES);

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

export const relationshipImpactRules: Record<string, ImpactRule> = Object.fromEntries(
  Object.entries(IMPACT_LANES).map(([type, lane]) => [type, rule(type as RelationshipType, lane)]),
);

export const impactSectionTitle: Record<ImpactSeverity, string> = {
  direct: "Stops working",
  loses_sign_in: "Can't sign in",
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
  loses_sign_in: 1,
  degraded: 2,
  loses_support: 3,
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
  const queue: { id: string; depth: number; path: ImpactStep[] }[] = [{ id: failedId, depth: 0, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= MAX_DEPTH) continue;
    const candidates: { edge: ImpactEdge; affectedId: string; severity: ImpactSeverity; rule: ImpactRule }[] = [];
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
      if (!severity || !affectedId || affectedId === current.id || affectedId === failedId) continue;
      candidates.push({ edge, affectedId, severity, rule });
    }
    // Worst link first, so an item reached by both a stop and a softer link is a stop.
    candidates.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const { edge, affectedId, severity, rule } of candidates) {
      const existing = hits.get(affectedId);
      // A terminal hit (can't sign in) gives way to a stop found later; nothing else is revisited.
      if (existing && !(TERMINAL.has(existing.severity) && SEVERITY_ORDER[severity] < SEVERITY_ORDER[existing.severity])) continue;
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
      if (!TERMINAL.has(severity)) queue.push({ id: affectedId, depth, path });
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
  const order: ImpactSeverity[] = ["direct", "loses_sign_in", "degraded", "loses_support"];
  return order
    .map((severity) => ({
      title: impactSectionTitle[severity],
      severity,
      hits: hits.filter((hit) => hit.severity === severity),
    }))
    .filter((group) => group.hits.length > 0);
}

export function impactReachLabel(hit: ImpactHit): string {
  if (hit.severity === "loses_sign_in") return "Can't sign in";
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
  /** Set on applications and platforms: whether a sign-in link could apply, and whether it is confirmed as its own login. */
  signIn?: { candidate: boolean; ownLogin: boolean };
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
  const signIn = rows.filter((row) => row.severity === "loses_sign_in");
  const degraded = rows.filter((row) => row.severity === "degraded");
  const support = rows.filter((row) => row.severity === "loses_support");
  const clauses = [
    clause(direct, "stops working", "stop working"),
    clause(signIn, "can't sign in", "can't sign in"),
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
    gaps: [
      ...impactGaps(input.source, rows.map((row) => row.record), input.edges),
      ...signInGaps(input.source, input.records, input.edges),
    ],
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

/**
 * When something signs in with the failed record, the apps and platforms with no sign-in
 * recorded may be affected too. Apps confirmed as their own login are not listed.
 */
export function signInGaps(source: ImpactRecord, records: ImpactRecord[], edges: ImpactEdge[]): string[] {
  if (!edges.some((edge) => edge.type === "authenticates_via" && edge.toId === source.id)) return [];
  const signsIn = new Set(edges.filter((edge) => edge.type === "authenticates_via").map((edge) => edge.fromId));
  const unknown = records.filter(
    (record) => record.id !== source.id && record.signIn?.candidate && !record.signIn.ownLogin && !signsIn.has(record.id)
  );
  if (!unknown.length) return [];
  const names = nameList(unknown.map((record) => record.name));
  return unknown.length === 1
    ? [`${names} has no sign-in recorded, so it may be affected too.`]
    : [`${unknown.length} apps have no sign-in recorded, so they may be affected too: ${names}.`];
}
