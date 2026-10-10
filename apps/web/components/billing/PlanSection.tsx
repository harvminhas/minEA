"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { billingApi } from "@/lib/api-client";
import {
  PLAN_DESCRIPTIONS,
  PLAN_LABELS,
  isPaidPlan,
  normalizePlan,
  shareCreateBlockedMessage,
  shareQuotaLabel,
  workspaceCreateBlockedMessage,
  workspaceQuotaLabel,
} from "@/lib/plan-features";
import type { Org } from "@minea/types";
import { businessGetStartedHref } from "@/lib/billing/business-request";

const BUSINESS_FEATURES = [
  "Unlimited workspaces",
  "AI architecture chat",
  "Team collaboration, starting from 5 licences",
  "Share links for views, roadmaps, and objects",
  "4 hours of onboarding consulting included",
  "Pay by invoice or card, monthly or annual",
];

interface Props {
  orgSlug: string;
  org: Org | undefined;
  billingMessage?: string | null;
  onClearBillingMessage?: () => void;
}

export function PlanSection({ orgSlug, org, billingMessage, onClearBillingMessage }: Props) {
  const { getToken } = useAuth();

  const plan = normalizePlan(org?.plan);

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return billingApi.status(orgSlug, token!);
    },
    enabled: !!orgSlug,
  });

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="font-semibold text-gray-900 mb-2">Plan</h2>

      {billingMessage && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            billingMessage.includes("success") || billingMessage.includes("Welcome")
              ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
              : "bg-gray-50 text-gray-600 border border-gray-200"
          }`}
        >
          {billingMessage}
          {onClearBillingMessage && (
            <button
              type="button"
              onClick={onClearBillingMessage}
              className="ml-2 text-xs underline opacity-70"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      <p className="text-sm text-gray-700 font-medium">{PLAN_LABELS[plan]}</p>
      <p className="text-sm text-gray-500 mt-1">{PLAN_DESCRIPTIONS[plan]}</p>

      {billingStatus && (
        <p className="text-xs text-gray-500 mt-2">
          {workspaceQuotaLabel(
            billingStatus.own_workspace_count,
            billingStatus.own_workspace_limit
          )}
          {" · "}
          {shareQuotaLabel(
            billingStatus.active_share_link_count,
            billingStatus.active_share_link_limit
          )}
          {!billingStatus.can_create_own_workspace && (
            <span className="block text-gray-400 mt-1">
              {workspaceCreateBlockedMessage(plan, billingStatus.own_workspace_limit)}
            </span>
          )}
          {!billingStatus.can_create_share_link && (
            <span className="block text-gray-400 mt-1">
              {shareCreateBlockedMessage(plan, billingStatus.active_share_link_limit)}
            </span>
          )}
        </p>
      )}

      {isPaidPlan(plan) && (
        <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
          <Check size={12} />
          {PLAN_LABELS[plan]} plan active
        </p>
      )}

      {plan === "free" && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Upgrade to Business</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Tell us how many licences you need and how you&apos;d like to pay.
              </p>
              <ul className="mt-3 space-y-1">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <Check size={12} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={businessGetStartedHref({ org: orgSlug, from: "plan_section" })}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}

      {isPaidPlan(plan) && (
        <p className="text-xs text-gray-400 mt-3">
          Need more licences?{" "}
          <Link
            href={businessGetStartedHref({ org: orgSlug, from: "plan_section" })}
            className="text-indigo-600 hover:text-indigo-700"
          >
            Request a Business change
          </Link>
          .
        </p>
      )}
    </section>
  );
}
