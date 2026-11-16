/**
 * Paths and relationship helpers for the capability detail page.
 * Move preserves relationship attributes (fitness) by creating the new
 * link first, then deleting the old one — never a bare delete+recreate.
 */
import type { ObjectType } from "@minea/types";
import { isActivity, parseLinkFitness, type FitnessKind, type TreeNode } from "@/lib/capability-tree";
import { modelItemPath, modelPath } from "@/lib/mvp-paths";

export type CapabilityDetailQuery = {
  activity?: string | null;
  tab?: string | null;
  details?: string | null;
  focus?: string | null;
};

export function capabilityDetailPath(
  basePath: string,
  capabilityId: string,
  opts: CapabilityDetailQuery = {}
): string {
  const path = `${basePath}/model/capabilities/${encodeURIComponent(capabilityId)}`;
  const params = new URLSearchParams();
  if (opts.activity) params.set("activity", opts.activity);
  if (opts.tab) params.set("tab", opts.tab);
  if (opts.details) params.set("details", opts.details);
  if (opts.focus) params.set("focus", opts.focus);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function capabilityMapPath(basePath: string): string {
  return modelPath(basePath, "capabilities");
}

export function capabilityOpenPath(
  basePath: string,
  id: string,
  objects: Array<{ id: string; type: string; properties?: Record<string, unknown> | null }>
): string {
  const object = objects.find((item) => item.id === id);
  if (object?.type === "capability" && isActivity(object.properties)) {
    const parentId = String(object.properties?.parent_id ?? "");
    if (parentId) return capabilityDetailPath(basePath, parentId, { activity: object.id });
  }
  if (object?.type === "capability") return capabilityDetailPath(basePath, object.id);
  return modelItemPath(basePath, "capabilities", id);
}

export type RelLike = {
  id: string;
  type: string;
  from_object_id: string;
  to_object_id: string;
  from_type?: string;
  to_type?: string;
  attributes?: Record<string, unknown> | null;
};

export type AppRef = {
  id: string;
  name: string;
  type: string;
  status?: string | null;
};

const LINKABLE_TYPES = new Set<ObjectType>(["application", "cloud_service", "solution", "technical_capability"]);

export function asLinkableType(type: string | null | undefined): ObjectType {
  return LINKABLE_TYPES.has(type as ObjectType) ? (type as ObjectType) : "application";
}

export function isLinkableApp(object: { type: string; status?: string | null }): boolean {
  if (!LINKABLE_TYPES.has(object.type as ObjectType)) return false;
  return String(object.status ?? "").toLowerCase() !== "retired";
}

export type AppLink = {
  relId: string;
  appId: string;
  appName: string;
  appType: string;
  targetId: string;
  attributes: Record<string, unknown>;
};

export function linksOn(
  targetId: string,
  edges: RelLike[],
  apps: Map<string, AppRef>
): AppLink[] {
  const links: AppLink[] = [];
  for (const rel of edges) {
    if (rel.type !== "supported_by" || rel.from_object_id !== targetId) continue;
    const app = apps.get(rel.to_object_id);
    if (!app) continue;
    links.push({
      relId: rel.id,
      appId: app.id,
      appName: app.name,
      appType: app.type,
      targetId,
      attributes: { ...(rel.attributes ?? {}) },
    });
  }
  links.sort((a, b) => a.appName.localeCompare(b.appName));
  return links;
}

export type MovePlan =
  | { kind: "noop" }
  | { kind: "delete-source"; sourceRelId: string }
  | {
      kind: "create-then-delete";
      sourceRelId: string;
      fromObjectId: string;
      toObjectId: string;
      toType: string;
      attributes: Record<string, unknown>;
    };

/** Plan a level move that keeps attributes (e.g. fitness). Never delete first. */
export function planMoveRelationship(rel: RelLike, targetId: string, existing: RelLike[]): MovePlan {
  if (!targetId || rel.from_object_id === targetId) return { kind: "noop" };
  const already = existing.find(
    (item) =>
      item.type === (rel.type || "supported_by") &&
      item.from_object_id === targetId &&
      item.to_object_id === rel.to_object_id
  );
  if (already) return { kind: "delete-source", sourceRelId: rel.id };
  return {
    kind: "create-then-delete",
    sourceRelId: rel.id,
    fromObjectId: targetId,
    toObjectId: rel.to_object_id,
    toType: asLinkableType(rel.to_type),
    attributes: { ...(rel.attributes ?? {}) },
  };
}

export type CoverageSummary = {
  headline: string;
  detail: string;
  tone: "good" | "fair" | "gap";
};

export function linkFitnessOf(link: { attributes?: Record<string, unknown> | null }): Exclude<FitnessKind, "none"> {
  const fitness = parseLinkFitness(link.attributes);
  return fitness === "none" ? "adequate" : fitness;
}

export function overlapList(appNames: string[]): string {
  const names = appNames.filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function overlapNote(appNames: string[], level: "activity" | "capability" = "activity"): string {
  const phrase = overlapList(appNames);
  if (!phrase || appNames.filter(Boolean).length < 2) return "";
  const verb = appNames.filter(Boolean).length === 2 ? "both support" : "all support";
  return `${phrase} ${verb} this ${level}.`;
}

export function fitnessSummary(node: TreeNode): CoverageSummary {
  if (node.fitness === "none") {
    return {
      headline: "—",
      detail: node.uniqueAppIds.length ? "No scored app link" : "No app to score",
      tone: "gap",
    };
  }
  if (node.fitness === "strong") return { headline: "Strong", detail: "All scored links are strong", tone: "good" };
  if (node.fitness === "adequate") {
    return {
      headline: "Adequate",
      detail: node.fitnessHint ? `Weakest link: ${node.fitnessHint}` : "Weakest scored link is adequate",
      tone: "fair",
    };
  }
  return {
    headline: "Weak",
    detail: node.fitnessHint ? `Weakest link: ${node.fitnessHint}` : "A scored link is weak",
    tone: "gap",
  };
}

export function redundancySummary(node: TreeNode): CoverageSummary {
  if (node.redundancy === "gap") return { headline: "—", detail: "No app", tone: "gap" };
  if (node.redundancy === "none") return { headline: "None", detail: "No overlap", tone: "good" };
  const phrase = overlapList(node.redundancyApps);
  let detail = node.redundancyHint ?? "Two or more apps support the same activity";
  if (phrase) {
    // Don't lead with this record's own name ("Homebuyer Experience: Power BI, Dynamics 365").
    detail = node.redundancyPlace && node.redundancyPlace !== node.name
      ? `${phrase} overlap on ${node.redundancyPlace}`
      : `${phrase} overlap`;
  }
  return { headline: "Overlap", detail, tone: node.redundancy === "many" ? "gap" : "fair" };
}

export function coverageSummary(node: TreeNode): CoverageSummary {
  const total = node.leafCount;
  const covered = node.coveredLeaves;
  if (total === 0) {
    if (node.uniqueAppIds.length) {
      return { headline: "Covered", detail: "No activities — apps on the capability", tone: "good" };
    }
    return { headline: "Gap", detail: "No activities and no app", tone: "gap" };
  }
  const detail = `${covered} of ${total} ${total === 1 ? "activity has" : "activities have"} an app`;
  if (node.coverage === "covered") return { headline: "Covered", detail, tone: "good" };
  if (node.coverage === "gap") return { headline: "Gap", detail, tone: "gap" };
  return { headline: "Partial", detail, tone: "fair" };
}

export type MoveTarget = { id: string; name: string; level: "capability" | "activity" };

export function moveTargetsFor(capability: TreeNode, currentTargetId: string): MoveTarget[] {
  const targets: MoveTarget[] = [{ id: capability.id, name: capability.name, level: "capability" }];
  for (const child of capability.children) {
    targets.push({ id: child.id, name: child.name, level: "activity" });
  }
  return targets.filter((target) => target.id !== currentTargetId);
}

export function findCapabilityNode(tree: TreeNode[], id: string): TreeNode | undefined {
  for (const domain of tree) {
    const hit = domain.children.find((child) => child.id === id);
    if (hit) return hit;
  }
  return undefined;
}
