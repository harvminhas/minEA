import Link from "next/link";
import { PlanCtaLink } from "@/components/marketing/home/visitor";
import { Check } from "lucide-react";

/*
 * Today's live pricing section, shown while NEXT_PUBLIC_BILLING_UI is off.
 * Moved unchanged from app/page.tsx; do not edit the copy here.
 */

const FREE_FEATURES = [
  "All views — heatmap, journeys, investments, tech debt",
  "Full repository, up to 50 objects",
  "One workspace, one share link",
  "Join unlimited workspaces shared with you",
];

const BUSINESS_FEATURES = [
  "Unlimited workspaces and repository objects",
  "AI architecture chat",
  "Team collaboration — contributor licenses, unlimited viewers",
  "Guided onboarding — we set you up for success",
];

const CONTACT_HREF = "/contact?interest=business";

export function LegacyPricing() {
  return (
    <section id="pricing" className="mt-28 w-full max-w-3xl scroll-mt-8 text-left">
      <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
      <p className="mb-10 text-center text-white/50">
        Start free. Upgrade when your team is ready.
      </p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.04] p-7">
          <h3 className="text-lg font-semibold text-white">Free</h3>
          <p className="mt-2 text-3xl font-bold">
            $0
            <span className="text-sm font-normal text-white/40"> forever</span>
          </p>
          <p className="mt-2 mb-6 text-sm text-white/50">
            Everything one person needs to map an architecture.
          </p>
          <ul className="flex-1 space-y-2.5">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-white/60">
                <Check size={15} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                {feature}
              </li>
            ))}
          </ul>
          <PlanCtaLink className="mt-7 inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/40">
            Start free
          </PlanCtaLink>
        </div>

        <div className="flex flex-col rounded-2xl border border-indigo-500/40 bg-indigo-950/40 p-7">
          <h3 className="text-lg font-semibold text-white">Business</h3>
          <p className="mt-2 text-3xl font-bold">Contact us</p>
          <p className="mt-2 mb-6 text-sm text-white/50">
            For teams that run on their architecture model.
          </p>
          <ul className="flex-1 space-y-2.5">
            {BUSINESS_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-white/60">
                <Check size={15} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href={CONTACT_HREF}
            className="mt-7 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
