"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import {
  CATALOG,
  PLAN_ORDER,
  PRICE_NOTE,
  VIEWERS_NOTE,
  formatUsd,
  monthsFreeOnYearly,
  planIncludes,
  priceLabel,
  yearlyPerMonthUsd,
  yearlySavingsUsd,
  type BillingInterval,
} from "@/lib/billing/plans";

/** Public pricing: Free plus the three licence packs. Shown when NEXT_PUBLIC_BILLING_UI is on. */
export function PricingPlans() {
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");

  return (
    <section id="pricing" className="mt-28 w-full max-w-6xl scroll-mt-8 text-left">
      <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
      <p className="mb-8 text-center text-white/50">
        Start free. Pay for the people who edit. Everyone else views for free.
      </p>

      <div className="mb-10 flex justify-center">
        <div
          role="group"
          aria-label="Billing period"
          className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1"
        >
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setBillingInterval(value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                interval === value ? "bg-indigo-600 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {value === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = CATALOG[id];
          const featured = id === "team";
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
                    For teams
                  </span>
                )}
              </div>
              <p className="mt-2 text-3xl font-bold">
                {priceLabel(plan, interval).replace(/\/(mo|yr)$/, "")}
                <span className="text-sm font-normal text-white/40">
                  {plan.monthlyUsd === 0 ? " forever" : interval === "yearly" ? " /year" : " /month"}
                </span>
              </p>
              <p className="mt-1 min-h-[1.25rem] text-xs text-white/40">
                {plan.monthlyUsd > 0 && interval === "yearly"
                  ? `${formatUsd(yearlyPerMonthUsd(plan))}/mo · save ${formatUsd(yearlySavingsUsd(plan))} (${monthsFreeOnYearly(plan)} months free)`
                  : plan.monthlyUsd > 0
                    ? `or ${formatUsd(plan.yearlyUsd)}/year`
                    : ""}
              </p>
              <p className="mt-3 mb-5 text-sm text-white/50">{plan.tagline}</p>
              <ul className="flex-1 space-y-2">
                {planIncludes(plan).map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-white/60">
                    <Check size={15} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/sign-up"
                className={`mt-6 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
                  featured
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "border border-white/20 hover:border-white/40"
                }`}
              >
                {id === "free" ? "Start free" : "Get started"}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-8 space-y-1 text-center text-xs text-white/40">
        <p>{VIEWERS_NOTE} Every plan starts with a free account; upgrade any time in Settings.</p>
        <p>{PRICE_NOTE}</p>
      </div>
    </section>
  );
}
