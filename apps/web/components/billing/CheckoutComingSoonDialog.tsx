"use client";

import { useEffect } from "react";
import {
  CATALOG,
  PRICE_NOTE,
  priceLabel,
  type BillingInterval,
  type PackId,
} from "@/lib/billing/plans";

interface Props {
  pack: PackId;
  interval: BillingInterval;
  currentLabel: string;
  onClose: () => void;
}

/**
 * Placeholder until Stripe checkout exists. It only closes: no API call, no plan change.
 */
export function CheckoutComingSoonDialog({ pack, interval, currentLabel, onClose }: Props) {
  const plan = CATALOG[pack];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-coming-soon-title"
        data-testid="checkout-coming-soon"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 id="checkout-coming-soon-title" className="font-semibold text-gray-900">
          Checkout coming soon
        </h3>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <p>
            Card checkout for <span className="font-medium text-gray-900">{plan.label}</span> (
            {priceLabel(plan, interval)}, {plan.licences} licence{plan.licences === 1 ? "" : "s"})
            isn&apos;t switched on yet.
          </p>
          <p>
            Nothing has changed: you&apos;re still on{" "}
            <span className="font-medium text-gray-900">{currentLabel}</span> and you haven&apos;t
            been charged.
          </p>
          <p className="text-xs text-gray-400">{PRICE_NOTE}</p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
