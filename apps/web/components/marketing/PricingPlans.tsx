"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  BUSINESS_DETAILS,
  BUSINESS_GET_STARTED_LABEL,
  CATALOG,
  PUBLIC_PLAN_ORDER,
  PRICE_NOTE,
  VIEWERS_NOTE,
  formatUsd,
  planIncludes,
} from "@/lib/billing/plans";
import { PAID_COMING_SOON_LABEL } from "@/lib/billing/checkout";
import { PlanCtaLink } from "@/components/marketing/home/visitor";
import { BusinessGetStartedDialog } from "@/components/billing/BusinessGetStartedDialog";

/**
 * Public pricing: Free, Starter and Business. Shown when NEXT_PUBLIC_BILLING_UI is on.
 * Starter shows its monthly price (monthly only, no yearly option) with a disabled "Coming soon" button (checkout is allowlisted).
 * Business shows no price, only its details, and "Get started" opens the request form.
 * Team is no longer sold (orgs already on it keep it).
 */
export function PricingPlans() {
  const [businessOpen, setBusinessOpen] = useState(false);

  return (
    <section id="pricing" className="mt-28 w-full max-w-6xl scroll-mt-8 text-left">
      <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
      <p className="mb-10 text-center text-white/50">
        Start free. Pay for the people who edit. Everyone else views for free.
      </p>
      {/* No monthly/yearly toggle: Starter is monthly only and Business shows no price. */}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 max-w-5xl mx-auto">
        {PUBLIC_PLAN_ORDER.map((id) => {
          const plan = CATALOG[id];
          const featured = id === "business";
          const isBusiness = id === "business";
          return (
            <div
              key={id}
              data-plan={id}
              className={`flex flex-col rounded-2xl border p-6 ${
                featured
                  ? "border-indigo-500/50 bg-indigo-950/40"
                  : "border-white/[0.08] bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{plan.label}</h3>
                {featured && (
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                    For teams of 5+
                  </span>
                )}
              </div>
              {isBusiness ? (
                <>
                  <p className="mt-2 text-3xl font-bold" data-testid="business-licences">
                    {BUSINESS_DETAILS[0]}
                  </p>
                  <p className="mt-1 min-h-[1.25rem] text-xs text-white/40">Monthly or annual billing</p>
                </>
              ) : (
              <>
              <p className="mt-2 text-3xl font-bold">
                {formatUsd(plan.monthlyUsd)}
                <span className="text-sm font-normal text-white/40">
                  {plan.monthlyUsd === 0 ? " forever" : " /month"}
                </span>
              </p>
              <p className="mt-1 min-h-[1.25rem] text-xs text-white/40">
                {plan.monthlyUsd > 0 ? "Billed monthly" : ""}
              </p>
              </>
              )}
              <p className="mt-3 mb-5 text-sm text-white/50">{plan.tagline}</p>
              <ul className="flex-1 space-y-2">
                {(isBusiness ? BUSINESS_DETAILS.slice(1) : planIncludes(plan)).map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-white/60">
                    <Check size={15} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                    {line}
                  </li>
                ))}
              </ul>
              {id === "free" ? (
                <PlanCtaLink className="mt-6 inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/40">
                  Start free
                </PlanCtaLink>
              ) : isBusiness ? (
                <button
                  type="button"
                  data-get-started="business"
                  onClick={() => setBusinessOpen(true)}
                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                >
                  {BUSINESS_GET_STARTED_LABEL}
                </button>
              ) : (
                // Starter is not on sale yet outside the checkout allowlist (the API refuses too). are not on sale yet (the API refuses checkout too). Same for everyone.
                <button
                  type="button"
                  disabled
                  data-coming-soon={id}
                  className="mt-6 inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-white/10 px-5 py-2.5 text-sm font-semibold text-white/40"
                >
                  {PAID_COMING_SOON_LABEL}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 space-y-1 text-center text-xs text-white/40">
        <p>{VIEWERS_NOTE} Every plan starts with a free account; upgrade any time in Settings.</p>
        <p>{PRICE_NOTE}</p>
      </div>

      {businessOpen && (
        <BusinessGetStartedDialog theme="dark" source="pricing" onClose={() => setBusinessOpen(false)} />
      )}
    </section>
  );
}
