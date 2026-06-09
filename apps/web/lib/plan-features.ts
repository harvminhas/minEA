import type { Org, ShareResourceType } from "@minea/types";
import type { ViewId } from "@/lib/views";

export type OrgPlan = Org["plan"];

const LEGACY_PLAN_MAP: Record<string, OrgPlan> = {
  starter: "business",
  growth: "business",
  solo: "business",
  team: "business",
};

export function normalizePlan(plan: string | undefined | null): OrgPlan {
  if (!plan) return "free";
  const mapped = LEGACY_PLAN_MAP[plan] ?? plan;
  if (mapped === "free" || mapped === "business") return mapped;
  return "free";
}

const ALL_SHARE_TYPES: ShareResourceType[] = [
  "view",
  "roadmap",
  "object",
  "capability_map",
  "capability_domain",
];

const PLAN_SHARE: Record<OrgPlan, Set<ShareResourceType>> = {
  free: new Set(["view"]),
  business: new Set(ALL_SHARE_TYPES),
};

export const PLAN_LABELS: Record<OrgPlan, string> = {
  free: "Free",
  business: "Business",
};

export const PLAN_OWN_WORKSPACE_LIMITS: Record<OrgPlan, number | null> = {
  free: 1,
  business: null,
};

export const PLAN_OBJECT_LIMITS: Record<OrgPlan, number | null> = {
  free: 50,
  business: null,
};

export const PLAN_SHARE_LINK_LIMITS: Record<OrgPlan, number | null> = {
  free: 1,
  business: 50,
};

export const PLAN_DESCRIPTIONS: Record<OrgPlan, string> = {
  free:
    "One user, one workspace, up to 50 repository objects, all views. Join unlimited workspaces others share with you.",
  business:
    "Unlimited workspaces, AI chat, team collaboration, and guided onboarding. Contact us for pricing.",
};

export function workspaceQuotaLabel(count: number, limit: number | null | undefined): string {
  if (limit == null) {
    return `${count} owned workspace${count === 1 ? "" : "s"}`;
  }
  return `${count} of ${limit} owned workspace${limit === 1 ? "" : "s"}`;
}

export function shareQuotaLabel(count: number, limit: number | null | undefined): string {
  if (limit == null) {
    return `${count} active share link${count === 1 ? "" : "s"}`;
  }
  return `${count} of ${limit} active share link${limit === 1 ? "" : "s"}`;
}

export function shareCreateBlockedMessage(
  plan: OrgPlan | string | undefined | null,
  limit?: number | null
): string {
  const p = normalizePlan(plan ?? "free");
  if (p === "free") {
    return "Free includes one active share link. Contact us for Business for more, or revoke an existing link first.";
  }
  const cap = limit ?? PLAN_SHARE_LINK_LIMITS[p];
  return `Your ${PLAN_LABELS[p]} plan allows up to ${cap} active share links. Revoke an existing link to create a new one.`;
}

export function workspaceCreateBlockedMessage(
  plan: OrgPlan | string | undefined | null,
  limit?: number | null
): string {
  const p = normalizePlan(plan ?? "free");
  if (p === "free") {
    return (
      "Free includes one workspace. Contact us for Business to create more workspaces, " +
      "or join unlimited workspaces shared with you by others."
    );
  }
  const cap = limit ?? PLAN_OWN_WORKSPACE_LIMITS[p];
  return (
    `Your ${PLAN_LABELS[p]} plan allows up to ${cap} owned workspaces. ` +
    "You can still access unlimited workspaces shared with you by other organizations."
  );
}

export function objectCreateBlockedMessage(
  plan: OrgPlan | string | undefined | null,
  limit?: number | null
): string {
  const p = normalizePlan(plan ?? "free");
  if (p === "free") {
    const cap = limit ?? PLAN_OBJECT_LIMITS.free;
    return `Free includes up to ${cap} repository objects. Contact us for Business to add more.`;
  }
  return "Repository object limit reached. Contact us to adjust your plan.";
}

export function planAllowsAiChat(plan: OrgPlan | string | undefined | null): boolean {
  return normalizePlan(plan ?? "free") === "business";
}

export function planAllowsInvites(plan: OrgPlan | string | undefined | null): boolean {
  return normalizePlan(plan ?? "free") === "business";
}

export function planAllowsView(
  _plan: OrgPlan | string | undefined | null,
  _viewId: ViewId
): boolean {
  return true;
}

export function planAllowsShareResource(
  plan: OrgPlan | string | undefined | null,
  resourceType: ShareResourceType,
  resourceKey?: string
): boolean {
  const p = normalizePlan(plan ?? "free");
  const allowed = PLAN_SHARE[p] ?? new Set();
  if (!allowed.has(resourceType)) return false;
  if (resourceType === "view") {
    const shareable = new Set([
      "views/products",
      "views/capability-heatmap",
      "views/tech-debt",
      "views/journeys",
      "views/investments",
      "views/processes",
    ]);
    return !!resourceKey && shareable.has(resourceKey);
  }
  return p === "business";
}

export function viewUpgradeMessage(viewLabel: string): string {
  return `${viewLabel} is available on all plans.`;
}

export function inviteUpgradeMessage(_plan: OrgPlan): string {
  return "Inviting teammates requires a Business plan. Contact us for a quote based on contributor licenses.";
}

export const BUSINESS_CONTACT_EMAIL = "hello@bubomap.com";

/** @deprecated Use BUSINESS_CONTACT_EMAIL */
export const TEAM_CONTACT_EMAIL = BUSINESS_CONTACT_EMAIL;
