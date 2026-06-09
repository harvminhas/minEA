"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { billingApi } from "@/lib/api-client";
import {
  PLAN_DESCRIPTIONS,
  PLAN_LABELS,
  TEAM_CONTACT_EMAIL,
  normalizePlan,
  shareCreateBlockedMessage,
  shareQuotaLabel,
  workspaceCreateBlockedMessage,
  workspaceQuotaLabel,
} from "@/lib/plan-features";
import type { Org } from "@minea/types";

const SOLO_PRICE_LABEL = process.env.NEXT_PUBLIC_SOLO_PRICE_LABEL ?? "Solo plan";

const SOLO_FEATURES = [
  "Up to 5 owned workspaces",
  "All views (heatmap, journeys, investments, tech debt)",
  "AI architecture chat",
  "Share links for views and objects",
  "Unlimited guest access to workspaces others share with you",
  "Single user — no team invites",
];

interface Props {
  orgSlug: string;
  org: Org | undefined;
  billingMessage?: string | null;
  onClearBillingMessage?: () => void;
}

export function PlanSection({ orgSlug, org, billingMessage, onClearBillingMessage }: Props) {
  const { getToken } = useAuth();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const plan = normalizePlan(org?.plan);

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return billingApi.status(orgSlug, token!);
    },
    enabled: !!orgSlug,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return billingApi.startSoloCheckout(orgSlug, token!);
    },
    onSuccess: (data) => {
      setCheckoutError(null);
      window.location.href = data.checkout_url;
    },
    onError: (err: Error) => setCheckoutError(err.message),
  });

  const showSoloUpgrade = plan === "free" && billingStatus?.can_upgrade_solo;

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

      {plan === "solo" && (
        <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
          <Check size={12} />
          Active subscription
        </p>
      )}

      {showSoloUpgrade && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Upgrade to Solo</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {SOLO_PRICE_LABEL} — pay securely with Stripe. Cancel anytime.
              </p>
              <ul className="mt-3 space-y-1">
                {SOLO_FEATURES.map((f) => (
                  <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <Check size={12} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {checkoutError && (
                <p className="text-xs text-red-600 mt-2">{checkoutError}</p>
              )}
              <button
                type="button"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
                className="mt-4 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {checkoutMutation.isPending ? "Redirecting to Stripe…" : "Upgrade with Stripe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {plan === "free" && billingStatus && !billingStatus.stripe_configured && (
        <p className="text-xs text-amber-700 mt-3">
          Online Solo checkout is not configured yet. Contact support to upgrade.
        </p>
      )}

      {plan !== "team" && (
        <p className="text-xs text-gray-400 mt-4">
          Need collaborators?{" "}
          <Link
            href={`mailto:${TEAM_CONTACT_EMAIL}?subject=BuboMap%20Team%20plan`}
            className="text-indigo-600 hover:text-indigo-700"
          >
            Contact us for Team
          </Link>
          {" "}
          — custom contributor licenses, unlimited viewers.
        </p>
      )}

      {plan === "team" && (
        <p className="text-xs text-gray-400 mt-3">
          Your Team plan is managed by BuboMap. Contact us to adjust contributor licenses.
        </p>
      )}
    </section>
  );
}
