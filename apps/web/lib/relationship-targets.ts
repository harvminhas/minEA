import { ALLOWED_TRIPLES } from "@minea/types";
import { REGISTRY, recordTypeOf } from "@/lib/fields/registry";
import { readField, toPatch, type FieldEdge, type FieldPatch, type FieldRecord } from "@/lib/fields/save";

export const UI_TYPE_LABEL = {
  application: "Applications",
  solution: "Applications",
  technical_capability: "Applications",
  agent: "AI agents",
  ai_model: "AI models",
  cloud_service: "Platforms & cloud",
  model: "Servers & devices",
  location: "Locations",
  external_party: "Vendors & contracts",
  integration_flow: "Flows",
  api: "APIs",
  event: "Events",
  tool: "Integration infra",
  capability: "Capabilities",
  roadmap_item: "Roadmaps",
  data_store: "Data stores",
  data_object: "Data entities",
  data_domain: "Data domains",
  process: "Processes",
  component: "Components",
  tech_debt: "Tech debt",
} as const;

const UI_TYPE_SINGULAR: Record<keyof typeof UI_TYPE_LABEL, string> = {
  application: "Application",
  solution: "Application",
  technical_capability: "Application",
  agent: "AI agent",
  ai_model: "AI model",
  cloud_service: "Platform",
  model: "Server",
  location: "Location",
  external_party: "Vendor",
  integration_flow: "Flow",
  api: "API",
  event: "Event",
  tool: "Integration infra",
  capability: "Capability",
  roadmap_item: "Roadmap",
  data_store: "Data store",
  data_object: "Data entity",
  data_domain: "Data domain",
  process: "Process",
  component: "Component",
  tech_debt: "Tech debt",
};

export type LinkDirection = "outbound" | "inverse" | "both";

export type LinkTarget = {
  target: string;
  type: string;
  direction: LinkDirection;
};

export const AI_GROUP_LABEL = "AI";

/** Same groups and order as ModelSidebar. Owners stays only when a link exists. */
export const LINK_SIDEBAR: readonly { label: string; types: readonly string[] }[] = [
  { label: "Applications", types: ["application"] },
  { label: AI_GROUP_LABEL, types: ["agent", "ai_model"] },
  { label: "Platforms & cloud", types: ["cloud_service"] },
  { label: "Servers & devices", types: ["model"] },
  { label: "Locations", types: ["location"] },
  { label: "Connections", types: ["integration_flow", "api", "event", "tool"] },
  { label: "Vendors & contracts", types: ["external_party"] },
  { label: "Owners & teams", types: ["team", "role", "contact"] },
  { label: "Capabilities", types: ["capability"] },
  { label: "Roadmaps", types: ["roadmap_item"] },
  { label: "Data", types: ["data_store", "data_object", "data_domain"] },
];

function asApplication(type: string): string {
  if (type === "solution" || type === "technical_capability") return "application";
  return type;
}

function linksForPair(source: string, target: string): LinkTarget[] {
  const outbound = new Set<string>();
  const inverse = new Set<string>();
  for (const [type, from, to] of ALLOWED_TRIPLES) {
    if (from === source && to === target) outbound.add(type);
    if (from === target && to === source) inverse.add(type);
  }
  const links: LinkTarget[] = [];
  for (const type of new Set([...outbound, ...inverse])) {
    if (type === "sends_data_to" && source === "application" && target === "external_party") continue;
    const out = outbound.has(type);
    const inv = inverse.has(type);
    links.push({
      target,
      type,
      direction: out && inv ? "both" : out ? "outbound" : "inverse",
    });
  }
  return links;
}

export function linksForTarget(sourceType: string, targetType: string): LinkTarget[] {
  return linksForPair(asApplication(sourceType), targetType);
}

export function linkTargetsFor(sourceType: string): LinkTarget[] {
  const source = asApplication(sourceType);
  const links: LinkTarget[] = [];
  for (const group of LINK_SIDEBAR) {
    for (const target of group.types) links.push(...linksForPair(source, target));
  }
  return links;
}

export type LinkGroup = {
  label: string;
  options: { type: string; label: string }[];
};

export function linkGroupsFor(sourceType: string, extraTargets: readonly string[] = []): LinkGroup[] {
  const source = asApplication(sourceType);
  const targets = new Set([
    ...linkTargetsFor(sourceType).map((link) => link.target),
    ...extraTargets.filter((target) => linksForPair(source, target).length > 0),
  ]);
  const groups: LinkGroup[] = [];
  for (const group of LINK_SIDEBAR) {
    const options = group.types
      .filter((type) => targets.has(type))
      .map((type) => ({ type, label: uiTypeLabel(type) }));
    if (options.length === 0) continue;
    groups.push({ label: group.label, options });
  }
  const listed = new Set(LINK_SIDEBAR.flatMap((group) => group.types));
  for (const target of extraTargets) {
    if (!targets.has(target) || listed.has(target)) continue;
    groups.push({ label: uiTypeLabel(target), options: [{ type: target, label: uiTypeLabel(target) }] });
  }
  return groups;
}

export function offeredSections(sourceType: string): string[] {
  return linkGroupsFor(sourceType).flatMap((group) => group.options.map((option) => option.label));
}

export function uiTypeLabel(type: string, singular = false): string {
  const key = type as keyof typeof UI_TYPE_LABEL;
  if (singular) return UI_TYPE_SINGULAR[key] ?? UI_TYPE_LABEL[key] ?? type.replaceAll("_", " ");
  return UI_TYPE_LABEL[key] ?? type.replaceAll("_", " ");
}

export function emptyTypeHint(type: string): string {
  return `None yet: add in ${uiTypeLabel(type)}`;
}

/** Name-only create from the link dialog: Applications, Platforms, Servers, Locations, Vendors, AI agents, AI models. */
export const NAME_ONLY_LINK_TYPES = new Set([
  "application",
  "cloud_service",
  "model",
  "location",
  "external_party",
  "agent",
  "ai_model",
]);

export function fieldForDialogLink(
  sourceType: string,
  link: { type: string; target: string; direction: "outbound" | "inverse" }
) {
  const recordType = recordTypeOf(sourceType);
  if (!recordType) return null;
  for (const def of REGISTRY[recordType]) {
    if (def.source.kind !== "rel" || def.source.edge !== link.type) continue;
    if (!def.source.target.includes(link.target)) continue;
    if (def.source.dir === "out" && link.direction === "outbound") return def;
    if (def.source.dir === "in" && link.direction === "inverse") return def;
  }
  return null;
}

/** Field-backed dialog picks use the record field's patch, so a single value replaces the previous one. */
export function patchForPickedLink(
  sourceType: string,
  link: { type: string; target: string; direction: "outbound" | "inverse" },
  targetId: string,
  record: FieldRecord,
  edges: FieldEdge[],
  targetName?: string
): FieldPatch | null {
  const def = fieldForDialogLink(sourceType, link);
  if (!def || def.source.kind !== "rel") return null;
  const current = readField(def, record, edges);
  const existing = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  const value = def.source.single ? targetId : [...new Set([...existing, targetId])];
  return toPatch(def, value, record, edges, def.key === "vendor" ? targetName ?? "" : undefined, (id) => (id === targetId ? link.target : undefined));
}

/** A 200 for a link this pick kept is not "that relationship already exists". */
export function pickedLinkExisted(
  results: readonly { status: number; body: { from_object_id: string; to_object_id: string } }[],
  targetId: string
): boolean {
  return results.some(
    (result) => result.status === 200 && (result.body.from_object_id === targetId || result.body.to_object_id === targetId)
  );
}
