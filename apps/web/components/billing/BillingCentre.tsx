"use client";

import { useState } from "react";
import { Check, Eye } from "lucide-react";
import type { BillingStatus } from "@minea/types";
import {
  CATALOG,
  PACK_ORDER,
  PRICE_NOTE,
  VIEWERS_NOTE,
  entitlementsFor,
  formatCount,
  formatUsd,
  planChangeFor,
  planIncludes,
  priceLabel,
  showsOnboarding,
  yearlyPerMonthUsd,
  type BillingInterval,
  type DisplayPlanId,
  type PackId,
  type PlanChange,
} from "@/lib/billing/plans";
import { licencesUsedLabel, type LicenceSummary } from "@/lib/billing/licences";
import { shareQuotaLabel, workspaceQuotaLabel } from "@/lib/plan-features";
import { CheckoutComingSoonDialog } from "./CheckoutComingSoonDialog";
import { OnboardingCard } from "./OnboardingCard";

interface Props {
  displayPlan: DisplayPlanId;
  realPlan: DisplayPlanId;
  previewing: boolean;
  billingStatus: BillingStatus | undefined;
  licences: LicenceSummary | null;
}

function changeButton(change: PlanChange, label: string): { text: string; disabled: boolean } {
  switch (change.kind) {
    case "current":
      return { text: "Current plan", disabled: true };
    case "upgrade":
      return { text: `Upgrade to ${label}`, disabled: false };
    case "downgrade":
      return { text: `Change to ${label}`, disabled: false };
    case "switch":
      return { text: `Switch to ${label}`, disabled: false };
    case "blocked":
      return {
        text: `Unassign ${change.unassignFirst} licence${change.unassignFirst === 1 ? "" : "s"} first`,
        disabled: true,
      };
  }
}

/** Plan & billing tab. Display only: Upgrade/Change opens a "coming soon" dialog. */
export function BillingCentre({ displayPlan, realPlan, previewing, billingStatus, licences }: Props) {
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [checkoutPack, setCheckoutPack] = useState<PackId | null>(null);
  const current = entitlementsFor(displayPlan);
  const real = entitlementsFor(realPlan);
  const used = licences?.used ?? 1;

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6" data-testid="billing-centre">
      <h2 className="font-semibold text-gray-900 mb-4">Plan &amp; billing</h2>

      {previewing && (
        <p className="mb-4 flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
          <Eye size={13} />
          Previewing the {current.label} view. The real plan ({real.label}) has not changed.
        </p>
      )}

      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-xs uppercase tracking-wide text-gray-400">Current plan</p>
        <p className="mt-1 text-lg font-semibold text-gray-900" data-testid="current-plan">
          {current.label}
        </p>
        {current.isLegacy && (
          <p className="mt-1 text-sm text-gray-600">
            Your organisation stays on its existing Business plan with its current limits. No
            change is needed. You can move to a pack below whenever it suits you.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-400">Licences</dt>
            <dd className="font-medium text-gray-900" data-testid="licences-used">
              {licences ? licencesUsedLabel(licences) : "Loading…"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Viewers</dt>
            <dd className="font-medium text-gray-900">Free, unlimited</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">AI answers</dt>
            <dd className="font-medium text-gray-900">
              {current.aiAnswersPerMonth == null
                ? "Unchanged"
                : `${formatCount(current.aiAnswersPerMonth)} / month`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Apps &amp; platforms</dt>
            <dd className="font-medium text-gray-900">
              {current.isLegacy
                ? "Unchanged"
                : current.appsPlatforms == null
                  ? "Unlimited"
                  : `Up to ${current.appsPlatforms}`}
            </dd>
          </div>
        </dl>
        {billingStatus && (
          <p className="mt-3 text-xs text-gray-400">
            Current usage:{" "}
            {workspaceQuotaLabel(billingStatus.own_workspace_count, billingStatus.own_workspace_limit)}
            {" · "}
            {shareQuotaLabel(billingStatus.active_share_link_count, billingStatus.active_share_link_limit)}
          </p>
        )}
        {current.isPack && !previewing && (
          <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
            <Check size={12} /> {current.label} plan active
          </p>
        )}
      </div>

      {showsOnboarding(displayPlan) && (
        <div className="mt-4">
          <OnboardingCard hours={current.onboardingHours} planLabel={current.label} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {displayPlan === "free" ? "Upgrade" : "Change plan"}
        </h3>
        <div role="group" aria-label="Billing period" className="inline-flex rounded-lg border border-gray-200 p-0.5">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setBillingInterval(value)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                interval === value ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {value === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {PACK_ORDER.map((id) => {
          const plan = CATALOG[id];
          const change = planChangeFor(displayPlan, id, used);
          const button = changeButton(change, plan.label);
          const isCurrent = change.kind === "current";
          return (
            <div
              key={id}
              data-plan={id}
              className={`flex flex-col rounded-lg border p-4 ${
                isCurrent ? "border-indigo-400 bg-indigo-50/40" : "border-gray-200"
              }`}
            >
              <p className="font-semibold text-gray-900">{plan.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{priceLabel(plan, interval)}</p>
              <p className="text-xs text-gray-400 min-h-[1rem]">
                {interval === "yearly" ? `${formatUsd(yearlyPerMonthUsd(plan))}/mo billed yearly` : `or ${formatUsd(plan.yearlyUsd)}/yr`}
              </p>
              <ul className="mt-3 flex-1 space-y-1">
                {planIncludes(plan).map((line) => (
                  <li key={line} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <Check size={12} className="mt-0.5 flex-shrink-0 text-indigo-600" />
                    {line}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={button.disabled}
                onClick={() => setCheckoutPack(id)}
                className={`mt-4 rounded-md px-3 py-2 text-sm font-medium ${
                  button.disabled
                    ? "cursor-not-allowed border border-gray-200 text-gray-400"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {button.text}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-1 text-xs text-gray-400">
        <p>{VIEWERS_NOTE} Move between Starter, Team and Business in either direction when your licences fit.</p>
        <p>Free: 1 editor, 25 apps &amp; platforms, 25 AI answers a month.</p>
        <p>{PRICE_NOTE}</p>
      </div>

      {checkoutPack && (
        <CheckoutComingSoonDialog
          pack={checkoutPack}
          interval={interval}
          currentLabel={real.label}
          onClose={() => setCheckoutPack(null)}
        />
      )}
    </section>
  );
}
