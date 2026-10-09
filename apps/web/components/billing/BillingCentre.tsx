"use client";

import { useState } from "react";
import { AlertTriangle, Check, CreditCard, Eye, Loader2 } from "lucide-react";
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
import {
  billingErrorMessage,
  canStartBilling,
  checkoutReturnNotice,
  overCapBanner,
  packActionFor,
  PAID_COMING_SOON_LABEL,
  PORTAL_RETURN_NOTICE,
  showManageBilling,
  type CheckoutReturn,
} from "@/lib/billing/checkout";
import { CheckoutComingSoonDialog } from "./CheckoutComingSoonDialog";
import { OnboardingCard } from "./OnboardingCard";

interface Props {
  /** null until GET /billing/status has answered (see planFromStatus). */
  displayPlan: DisplayPlanId | null;
  realPlan: DisplayPlanId | null;
  previewing: boolean;
  billingStatus: BillingStatus | undefined;
  licences: LicenceSummary | null;
  /** The billing status request failed (after retries). */
  statusError?: boolean;
  onRetryStatus?: () => void;
  /** ?checkout=success|cancelled after returning from Stripe Checkout. */
  checkoutReturn?: CheckoutReturn | null;
  /** ?portal=return after returning from the Customer Portal. */
  portalReturn?: boolean;
  /** Starts Stripe Checkout and redirects. Only called when the API says checkout is available. */
  onCheckout?: (pack: PackId, interval: BillingInterval) => Promise<void>;
  /** Opens the Stripe Customer Portal and redirects. */
  onOpenPortal?: () => Promise<void>;
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

/**
 * Plan & billing tab. When the API reports Stripe checkout for this org, pack buttons start
 * Stripe Checkout (no subscription yet) or open the Customer Portal (already on a pack).
 * Otherwise they open the "coming soon" dialog as before.
 */
export function BillingCentre(props: Props) {
  const { displayPlan, realPlan, billingStatus } = props;
  // No plan, no buttons until the API has said what the org is on. Guessing from org.plan is
  // what showed "Business (legacy)" + Switch buttons after a portal plan switch.
  if (!billingStatus || !displayPlan || !realPlan) {
    return (
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6" data-testid="billing-centre">
        <h2 className="font-semibold text-gray-900 mb-4">Plan &amp; billing</h2>
        {props.statusError ? (
          <div role="alert" data-testid="billing-status-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Couldn&apos;t load your plan.{" "}
            {props.onRetryStatus && (
              <button type="button" onClick={props.onRetryStatus} className="font-medium underline">
                Try again
              </button>
            )}
          </div>
        ) : (
          <p data-testid="billing-status-loading" className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Loading your plan…
          </p>
        )}
      </section>
    );
  }
  return <LoadedBillingCentre {...props} displayPlan={displayPlan} realPlan={realPlan} billingStatus={billingStatus} />;
}

function LoadedBillingCentre({
  displayPlan,
  realPlan,
  previewing,
  billingStatus,
  licences,
  checkoutReturn,
  portalReturn,
  onCheckout,
  onOpenPortal,
}: Props & { displayPlan: DisplayPlanId; realPlan: DisplayPlanId; billingStatus: BillingStatus }) {
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [checkoutPack, setCheckoutPack] = useState<PackId | null>(null);
  const [busy, setBusy] = useState<PackId | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const current = entitlementsFor(displayPlan);
  const real = entitlementsFor(realPlan);
  const used = licences?.used ?? 1;
  const action = packActionFor(realPlan, billingStatus, previewing);
  const allowed = canStartBilling(billingStatus);
  const manageBilling = showManageBilling(billingStatus, previewing) && !!onOpenPortal;
  const overCap =
    !previewing &&
    !!billingStatus?.over_licence_cap &&
    billingStatus.licences_cap != null &&
    billingStatus.licences_used != null;

  async function run(target: PackId | "portal", fn: () => Promise<void>) {
    setBusy(target);
    setActionError(null);
    try {
      await fn(); // redirects to Stripe on success
    } catch (err) {
      setActionError(billingErrorMessage(err));
      setBusy(null);
    }
  }

  function onPackClick(id: PackId) {
    if (action === "unavailable") return; // server refuses checkout (403 paid_plans_coming_soon)
    if (action === "coming_soon" || !onCheckout || !onOpenPortal) {
      setCheckoutPack(id);
      return;
    }
    if (!allowed) return;
    if (action === "portal") void run(id, onOpenPortal);
    else void run(id, () => onCheckout(id, interval));
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6" data-testid="billing-centre">
      <h2 className="font-semibold text-gray-900 mb-4">Plan &amp; billing</h2>

      {checkoutReturn && !previewing && (
        <p
          data-testid="checkout-return"
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            checkoutReturn === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-gray-200 bg-gray-50 text-gray-700"
          }`}
        >
          {checkoutReturnNotice(checkoutReturn)}
        </p>
      )}

      {portalReturn && !checkoutReturn && !previewing && (
        <p data-testid="portal-return" className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {PORTAL_RETURN_NOTICE}
        </p>
      )}

      {overCap && (
        <p
          data-testid="over-cap-banner"
          className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          {overCapBanner(billingStatus!.licences_used!, billingStatus!.licences_cap!)}
        </p>
      )}

      {actionError && (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      )}

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
        {manageBilling && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="manage-billing"
              disabled={!allowed || busy !== null}
              onClick={() => onOpenPortal && void run("portal", onOpenPortal)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "portal" ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
              Manage billing
            </button>
            <span className="text-xs text-gray-400">
              Payment method, invoices, switching plans and cancelling.
            </span>
          </div>
        )}
        {action !== "coming_soon" && action !== "unavailable" && !allowed && (
          <p className="mt-3 text-xs text-gray-500">
            Only org owners and admins with a verified email can change the plan.
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

      {action === "unavailable" && (
        <p data-testid="paid-coming-soon" className="mt-2 text-xs text-gray-500">
          Paid plans are coming soon. Your organisation stays on its current plan for now.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {PACK_ORDER.map((id) => {
          const plan = CATALOG[id];
          const change = planChangeFor(displayPlan, id, used);
          const isCurrent = change.kind === "current";
          const button =
            action === "unavailable" && !isCurrent
              ? { text: PAID_COMING_SOON_LABEL, disabled: true }
              : changeButton(change, plan.label);
          const dataAction = action === "unavailable" && !isCurrent ? action : button.disabled ? undefined : action;
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
                data-action={dataAction}
                disabled={button.disabled || busy !== null || (action !== "coming_soon" && !allowed)}
                onClick={() => onPackClick(id)}
                className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
                  button.disabled || (action !== "coming_soon" && !allowed)
                    ? "cursor-not-allowed border border-gray-200 text-gray-400"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70"
                }`}
              >
                {busy === id && <Loader2 size={14} className="animate-spin" />}
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
