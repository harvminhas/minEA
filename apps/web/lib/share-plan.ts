import type { Org, ShareResourceType } from "@minea/types";

/** Mirrors backend PLAN_SHARE_RESOURCE_TYPES — update both when billing ships. */
const PLAN_SHARE_RESOURCE_TYPES: Record<Org["plan"], Set<ShareResourceType>> = {
  free: new Set(["view"]),
  starter: new Set(["view"]),
  growth: new Set(["view", "roadmap", "object", "capability_map", "capability_domain"]),
  business: new Set(["view", "roadmap", "object", "capability_map", "capability_domain"]),
};

const SHAREABLE_VIEW_KEYS = new Set([
  "views/products",
  "views/capability-heatmap",
  "views/tech-debt",
  "views/journeys",
  "views/investments",
]);

export function planAllowsShareResource(
  plan: Org["plan"] | undefined,
  resourceType: ShareResourceType,
  resourceKey?: string
): boolean {
  if (!plan) return false;
  const allowed = PLAN_SHARE_RESOURCE_TYPES[plan] ?? new Set();
  if (!allowed.has(resourceType)) return false;
  if (resourceType === "view") {
    return !!resourceKey && SHAREABLE_VIEW_KEYS.has(resourceKey);
  }
  return true;
}

export function shareUnavailableReason(
  plan: Org["plan"] | undefined,
  resourceType: ShareResourceType,
  resourceKey?: string
): string | null {
  if (planAllowsShareResource(plan, resourceType, resourceKey)) return null;
  if (!plan || !(PLAN_SHARE_RESOURCE_TYPES[plan]?.size)) {
    return "Sharing is not included on your plan. Upgrade to share views with stakeholders.";
  }
  if (resourceType === "view") {
    return "This view cannot be shared on your current plan.";
  }
  return `Sharing ${resourceType.replace("_", " ")} requires a Growth plan or higher.`;
}
