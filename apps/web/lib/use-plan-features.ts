"use client";

import { useAppStore } from "@/lib/store";
import {
  isPaidPlan,
  normalizePlan,
  planAllowsAiChat,
  planAllowsInvites,
  planAllowsView,
  type OrgPlan,
} from "@/lib/plan-features";
import type { ViewId } from "@/lib/views";

export function usePlanFeatures() {
  const { activeOrg } = useAppStore();
  const plan: OrgPlan = normalizePlan(activeOrg?.plan);

  return {
    plan,
    allowsAiChat: planAllowsAiChat(plan),
    allowsInvites: planAllowsInvites(plan),
    allowsView: (viewId: ViewId) => planAllowsView(plan, viewId),
    /** Any paid pack (Starter, Team, Business) — they share the same features. */
    isBusiness: isPaidPlan(plan),
    isFree: plan === "free",
  };
}
