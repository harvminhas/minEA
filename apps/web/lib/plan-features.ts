import type { Org, ShareResourceType } from "@minea/types";
import type { ViewId } from "@/lib/views";

export type OrgPlan = Org["plan"];

const LEGACY_PLAN_MAP: Record<string, OrgPlan> = {
  starter: "solo",
  growth: "solo",
  business: "team",
};

export function normalizePlan(plan: string | undefined | null): OrgPlan {
  if (!plan) return "free";
  const mapped = LEGACY_PLAN_MAP[plan] ?? plan;
  if (mapped === "free" || mapped === "solo" || mapped === "team") return mapped;
  return "free";
}

/** Analytical views in the Views gallery/sidebar (not repository editing). */
/** Product portfolio + process builder (repository); analytical lenses require Solo+. */
const FREE_VIEW_IDS = new Set<ViewId>(["products", "processes"]);

const ALL_SHARE_TYPES: ShareResourceType[] = [
  "view",
  "roadmap",
  "object",
  "capability_map",
  "capability_domain",
];

const PLAN_SHARE: Record<OrgPlan, Set<ShareResourceType>> = {
  free: new Set(["view"]),
  solo: new Set(ALL_SHARE_TYPES),
  team: new Set(ALL_SHARE_TYPES),
};

export const PLAN_LABELS: Record<OrgPlan, string> = {
  free: "Free",
  solo: "Solo",
  team: "Team",
};

export const PLAN_OWN_WORKSPACE_LIMITS: Record<OrgPlan, number | null> = {
  free: 1,
  solo: 5,
  team: 10,
};

export const PLAN_SHARE_LINK_LIMITS: Record<OrgPlan, number | null> = {
  free: 1,
  solo: 20,
  team: 50,
};

export const PLAN_DESCRIPTIONS: Record<OrgPlan, string> = {
  free:
    "Full repository and Product portfolio view. One workspace and one share link; join unlimited workspaces others share with you.",
  solo:
    "Everything for one person — all views, AI chat, sharing. Up to 5 owned workspaces; unlimited guest access elsewhere.",
  team:
    "Custom contributor licenses. Unlimited viewers. Up to 10 owned workspaces; unlimited guest access elsewhere.",
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
    return "Free includes one active share link. Upgrade to Solo for more, or revoke an existing link first.";
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
      "Free includes one workspace for sharing your portfolio. Upgrade to Solo to create more workspaces, " +
      "or join unlimited workspaces shared with you by others."
    );
  }
  const cap = limit ?? PLAN_OWN_WORKSPACE_LIMITS[p];
  return (
    `Your ${PLAN_LABELS[p]} plan allows up to ${cap} owned workspaces. ` +
    "You can still access unlimited workspaces shared with you by other organizations."
  );
}

export function planAllowsAiChat(plan: OrgPlan | string | undefined | null): boolean {
  const p = normalizePlan(plan ?? "free");
  return p === "solo" || p === "team";
}

export function planAllowsInvites(plan: OrgPlan | string | undefined | null): boolean {
  return normalizePlan(plan ?? "free") === "team";
}

export function planAllowsView(
  plan: OrgPlan | string | undefined | null,
  viewId: ViewId
): boolean {
  const p = normalizePlan(plan ?? "free");
  if (p !== "free") return true;
  return FREE_VIEW_IDS.has(viewId);
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
    const shareable = new Set(["views/products"]);
    if (p !== "free") {
      shareable.add("views/capability-heatmap");
      shareable.add("views/tech-debt");
      shareable.add("views/journeys");
      shareable.add("views/investments");
    }
    return !!resourceKey && shareable.has(resourceKey);
  }
  return p !== "free";
}

export function viewUpgradeMessage(viewLabel: string): string {
  return `${viewLabel} is available on Solo and Team plans.`;
}

export function inviteUpgradeMessage(plan: OrgPlan): string {
  if (plan === "solo") {
    return "Solo is for one person. Upgrade to Team to invite contributors — viewers are always unlimited.";
  }
  return "Collaboration requires a Team plan. Contact us for a quote based on contributor licenses.";
}

export const TEAM_CONTACT_EMAIL = "hello@bubomap.com";
