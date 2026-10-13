/**
 * Capabilities in the Model layout (STEP 3): an optional Domain grouping, "Supported by" links
 * (capability --supported_by--> app/platform, the same edge Impact and the legacy map read),
 * gaps, and a "Draft from my apps" suggestion list. Pure helpers only.
 */

export type CapObject = {
  id: string;
  type: string;
  name: string;
  status?: string | null;
  owner?: string | null;
  owner_team_name?: string | null;
  point_of_contact_name?: string | null;
  properties?: Record<string, unknown> | null;
};
export type CapEdge = { id?: string; type: string; from_object_id: string; to_object_id: string };

export const SUPPORTED_BY = "supported_by";
export const SUPPORT_TYPES = ["application", "cloud_service", "solution", "technical_capability"];
const SUPPORT_SET = new Set(SUPPORT_TYPES);
export const NO_DOMAIN = "No domain";

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function capabilitiesOf<T extends CapObject>(objects: readonly T[]): T[] {
  return objects.filter((object) => object.type === "capability").sort(byName);
}

/** The Domain field is a name; under the hood it is a business_domain record (so the legacy map agrees). */
export function domainName(capability: CapObject, objects: readonly CapObject[]): string {
  const id = capability.properties?.domain_id;
  if (typeof id !== "string" || !id) return "";
  return objects.find((object) => object.id === id && object.type === "business_domain")?.name ?? "";
}

/** Suggestions: domains already in use, then a few plain defaults. */
export const DEFAULT_DOMAINS = ["Sell", "Serve customers", "Deliver", "Finance", "People", "Operations", "IT"];
export function domainSuggestions(objects: readonly CapObject[]): string[] {
  const seen = new Map<string, string>();
  for (const domain of objects.filter((object) => object.type === "business_domain").sort(byName)) seen.set(norm(domain.name), domain.name);
  for (const name of DEFAULT_DOMAINS) if (!seen.has(norm(name))) seen.set(norm(name), name);
  return [...seen.values()];
}

/** Typed domain text → an existing business_domain id, a name to create, or clear. */
export function resolveDomain(text: string, objects: readonly CapObject[]): { id: string } | { create: string } | { clear: true } {
  const name = text.trim().replace(/\s+/g, " ");
  if (!name) return { clear: true };
  const found = objects.find((object) => object.type === "business_domain" && norm(object.name) === norm(name));
  return found ? { id: found.id } : { create: name };
}

export function ownerLabel(object: CapObject): string {
  return object.owner_team_name?.trim() || object.point_of_contact_name?.trim() || object.owner?.trim() || "";
}

export function supportersOf(capabilityId: string, objects: readonly CapObject[], edges: readonly CapEdge[]): CapObject[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const out = new Map<string, CapObject>();
  for (const edge of edges) {
    if (edge.type !== SUPPORTED_BY || edge.from_object_id !== capabilityId) continue;
    const target = byId.get(edge.to_object_id);
    if (target && SUPPORT_SET.has(target.type)) out.set(target.id, target);
  }
  return [...out.values()].sort(byName);
}

/** Capabilities an app supports, for the Applications list column and filter. */
export function capabilitiesForApp(appId: string, objects: readonly CapObject[], edges: readonly CapEdge[]): CapObject[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const out = new Map<string, CapObject>();
  for (const edge of edges) {
    if (edge.type !== SUPPORTED_BY || edge.to_object_id !== appId) continue;
    const cap = byId.get(edge.from_object_id);
    if (cap?.type === "capability") out.set(cap.id, cap);
  }
  return [...out.values()].sort(byName);
}

export type CapRow = { id: string; name: string; domain: string; owner: string; supportedBy: { id: string; name: string }[]; gap: boolean };
export type CapGroup = { domain: string; rows: CapRow[] };

export function capabilityRows(objects: readonly CapObject[], edges: readonly CapEdge[]): CapRow[] {
  return capabilitiesOf(objects).map((cap) => {
    const supportedBy = supportersOf(cap.id, objects, edges).map(({ id, name }) => ({ id, name }));
    return { id: cap.id, name: cap.name, domain: domainName(cap, objects), owner: ownerLabel(cap), supportedBy, gap: supportedBy.length === 0 };
  });
}

/** Domain groups A→Z, "No domain" last. With no domains at all it is one flat group. */
export function groupByDomain(rows: readonly CapRow[]): CapGroup[] {
  const groups = new Map<string, CapRow[]>();
  for (const row of rows) {
    const key = row.domain || NO_DOMAIN;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_DOMAIN ? 1 : b === NO_DOMAIN ? -1 : a.localeCompare(b)))
    .map(([domain, list]) => ({ domain, rows: list }));
}

// ─── Draft from my apps ───────────────────────────────────────────────────────

type Rule = { capability: string; domain: string; names?: RegExp; categories?: string[] };
const RULES: Rule[] = [
  { capability: "Customer relationship management", domain: "Sell", categories: ["crm"], names: /salesforce|hubspot|pipedrive|zoho crm|dynamics/i },
  { capability: "Marketing", domain: "Sell", names: /mailchimp|klaviyo|marketo|constant contact|hootsuite|canva/i },
  { capability: "Online sales", domain: "Sell", categories: ["commerce"], names: /shopify|woocommerce|bigcommerce|magento|square/i },
  { capability: "Customer support", domain: "Serve customers", categories: ["cx"], names: /zendesk|intercom|freshdesk|help ?scout|gorgias/i },
  { capability: "Order management", domain: "Deliver", names: /order|edi/i },
  { capability: "Inventory & warehouse", domain: "Deliver", categories: ["supply chain"], names: /inventory|warehouse|shipstation|shipping|label/i },
  { capability: "Accounting", domain: "Finance", categories: ["finance", "erp"], names: /quickbooks|xero|sage|netsuite|freshbooks|invoic/i },
  { capability: "Payments", domain: "Finance", names: /stripe|paypal|square|adyen/i },
  { capability: "Bills & expenses", domain: "Finance", names: /bill\.com|expensify|ramp|brex|divvy/i },
  { capability: "Payroll & HR", domain: "People", categories: ["hr"], names: /gusto|adp|rippling|bamboo|workday|payroll|time clock/i },
  { capability: "Contracts & e-signature", domain: "Operations", names: /docusign|pandadoc|adobe sign/i },
  { capability: "Scheduling", domain: "Operations", names: /calendly|acuity/i },
  { capability: "Project & task management", domain: "Operations", names: /asana|jira|monday|trello|clickup|basecamp/i },
  { capability: "Team communication", domain: "IT", categories: ["collaboration"], names: /slack|teams|zoom|microsoft 365|google workspace|gmail|outlook/i },
  { capability: "Documents & knowledge", domain: "IT", names: /notion|confluence|dropbox|box|sharepoint|google drive|intranet/i },
  { capability: "Identity & access", domain: "IT", names: /okta|entra|azure ad|onelogin|jumpcloud|1password/i },
  { capability: "Software development", domain: "IT", names: /github|gitlab|bitbucket/i },
  { capability: "Design", domain: "Sell", names: /figma|adobe|autocad/i },
  { capability: "Reporting & analytics", domain: "Operations", categories: ["analytics"], names: /tableau|power bi|looker|excel/i },
];

export type DraftCapability = { key: string; name: string; domain: string; appIds: string[]; existingId?: string };

/** One suggestion per capability, pre-linked to every existing app/platform that fits. Nothing is saved here. */
export function draftFromApps(objects: readonly CapObject[], edges: readonly CapEdge[]): DraftCapability[] {
  const apps = objects.filter((object) => (object.type === "application" || object.type === "cloud_service") && object.status !== "retired").sort(byName);
  const existing = new Map(capabilitiesOf(objects).map((cap) => [norm(cap.name), cap]));
  const drafts = new Map<string, DraftCapability>();
  for (const app of apps) {
    const category = typeof app.properties?.category === "string" ? norm(app.properties.category) : "";
    const rule = RULES.find((item) => item.names?.test(app.name)) ?? RULES.find((item) => category && item.categories?.includes(category));
    if (!rule) continue;
    const prior = existing.get(norm(rule.capability));
    if (prior && edges.some((edge) => edge.type === SUPPORTED_BY && edge.from_object_id === prior.id && edge.to_object_id === app.id)) continue;
    const draft = drafts.get(rule.capability) ?? { key: norm(rule.capability), name: prior?.name ?? rule.capability, domain: rule.domain, appIds: [], ...(prior ? { existingId: prior.id } : {}) };
    draft.appIds.push(app.id);
    drafts.set(rule.capability, draft);
  }
  return [...drafts.values()].sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
}

/** Confirm → domains to create first, then one batch of capabilities + supported_by links. */
export function draftPlan(picked: readonly DraftCapability[], objects: readonly CapObject[]) {
  const domainsToCreate: string[] = [];
  for (const draft of picked) {
    if (draft.existingId) continue;
    const resolved = resolveDomain(draft.domain, objects);
    if ("create" in resolved && !domainsToCreate.some((name) => norm(name) === norm(resolved.create))) domainsToCreate.push(resolved.create);
  }
  return {
    domainsToCreate,
    batch: (domainIds: Map<string, string>) => {
      const typeOf = new Map(objects.map((object) => [object.id, object.type]));
      const creates = picked
        .filter((draft) => !draft.existingId)
        .map((draft) => {
          const resolved = resolveDomain(draft.domain, objects);
          const domainId = "id" in resolved ? resolved.id : domainIds.get(norm(draft.domain));
          return { key: draft.key, type: "capability", name: draft.name, properties: domainId ? { domain_id: domainId } : {} };
        });
      const relationships = picked.flatMap((draft) =>
        draft.appIds.map((appId) => ({
          type: SUPPORTED_BY,
          ...(draft.existingId ? { from_id: draft.existingId } : { from_key: draft.key }),
          to_id: appId,
          from_type: "capability",
          to_type: typeOf.get(appId) ?? "application",
        }))
      );
      return { creates, updates: [], relationships };
    },
  };
}

export const domainKey = norm;

// ─── Applications list: Capabilities column and filter ────────────────────────

export const ANY_CAPABILITY = "Any capability";
export const NO_CAPABILITY = "No capability";

/** app id → capability names it supports (A→Z). */
export function appCapabilityIndex(objects: readonly CapObject[], edges: readonly CapEdge[]): Map<string, string[]> {
  const caps = new Map(capabilitiesOf(objects).map((cap) => [cap.id, cap.name]));
  const index = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type !== SUPPORTED_BY) continue;
    const name = caps.get(edge.from_object_id);
    if (!name) continue;
    index.set(edge.to_object_id, (index.get(edge.to_object_id) ?? new Set()).add(name));
  }
  return new Map([...index].map(([id, names]) => [id, [...names].sort((a, b) => a.localeCompare(b))]));
}

export function capabilityFilterOptions(objects: readonly CapObject[]): string[] {
  return [ANY_CAPABILITY, NO_CAPABILITY, ...new Set(capabilitiesOf(objects).map((cap) => cap.name))];
}

export function matchesCapabilityFilter(names: readonly string[], filter: string): boolean {
  if (filter === ANY_CAPABILITY) return true;
  if (filter === NO_CAPABILITY) return names.length === 0;
  return names.includes(filter);
}

// ─── One Capability map page: Map (default) | List ────────────────────────────

export type CapabilityView = "map" | "list";
export function capabilityViewFrom(search: string): CapabilityView {
  return new URLSearchParams(search).get("view") === "list" ? "list" : "map";
}
