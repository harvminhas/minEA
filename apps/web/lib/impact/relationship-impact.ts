/**
 * Failure propagation for stored relationship types.
 *
 * Edges are stored once, source → target. Inverse words (called_by, includes,
 * replaced_by) are display labels only. They are not relationship types and
 * they are not written as a second edge. See RelationshipForm: an "inverse"
 * choice swaps the ends and stores the same type.
 *
 * Types with no entry here are not propagated. Ask before adding a rule.
 */

export type ImpactSeverity = "direct" | "degraded" | "loses_support";

export type ImpactRule = {
  /** Failed record is the stored target. The source is affected. */
  whenTargetFails?: ImpactSeverity;
  /** Failed record is the stored source. The target is affected. */
  whenSourceFails?: ImpactSeverity;
  label: (sourceName: string, targetName: string) => string;
};

export const relationshipImpactRules: Record<string, ImpactRule> = {
  calls: {
    whenTargetFails: "direct",
    label: (source, target) => `${source} calls ${target}`,
  },
  part_of: {
    whenTargetFails: "direct",
    whenSourceFails: "degraded",
    label: (source, target) => `${source} is part of ${target}`,
  },
  replaces: {
    label: (source, target) => `${source} replaces ${target}`,
  },
  supported_by: {
    whenTargetFails: "loses_support",
    label: (source, target) => `${source} is supported by ${target}`,
  },
  supports: {
    whenSourceFails: "loses_support",
    label: (source, target) => `${source} supports ${target}`,
  },
  runs_on: {
    whenTargetFails: "direct",
    label: (source, target) => `${source} runs on ${target}`,
  },
  built_on: {
    whenTargetFails: "direct",
    label: (source, target) => `${source} is built on ${target}`,
  },
  hosts: {
    whenSourceFails: "direct",
    label: (source, target) => `${source} hosts ${target}`,
  },
};

export type ImpactNode = { id: string; name: string };

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
