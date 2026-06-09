import type { Org, ShareResourceType } from "@minea/types";
import {
  planAllowsShareResource as checkPlanShare,
  normalizePlan,
  shareCreateBlockedMessage,
} from "@/lib/plan-features";

export function planAllowsShareResource(
  plan: Org["plan"] | string | undefined,
  resourceType: ShareResourceType,
  resourceKey?: string
): boolean {
  return checkPlanShare(plan, resourceType, resourceKey);
}

export function shareUnavailableReason(
  plan: Org["plan"] | string | undefined,
  resourceType: ShareResourceType,
  resourceKey?: string,
  atShareQuota?: boolean
): string | null {
  if (atShareQuota) {
    return shareCreateBlockedMessage(plan);
  }
  if (checkPlanShare(plan, resourceType, resourceKey)) return null;
  const p = normalizePlan(plan);
  if (p === "free" && resourceType !== "view") {
    return "Sharing this resource requires a Business plan.";
  }
  if (resourceType === "view") {
    return "This view cannot be shared on your current plan.";
  }
  return `Sharing ${resourceType.replace("_", " ")} requires Business.`;
}

export { shareCreateBlockedMessage, shareQuotaLabel } from "@/lib/plan-features";
