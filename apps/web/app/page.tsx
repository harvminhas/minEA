import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";

export const metadata: Metadata = {
  title: "BuboMap | The IT estate your whole team can finally see",
  description:
    "BuboMap provides a single connected source of truth for IT leaders, architects, and engineers. Gain visibility into portfolio health, manage dependencies, and surface tech debt without the baggage of heavyweight EA tooling.",
  keywords: [
    "IT estate visibility",
    "enterprise architecture software",
    "IT portfolio management",
    "dependency mapping",
    "capability gaps",
    "LeanIX alternative",
    "Ardoq alternative",
    "IT infrastructure context",
    "system ownership tracking",
    "tech debt management",
    "SMB enterprise architecture",
    "TOGAF alternative",
    "IT architecture repository",
    "connected source of truth",
  ],
  openGraph: {
    title: "BuboMap | The IT estate your whole team can finally see",
    description:
      "Leaders need visibility. Architects need a model they can maintain. Engineers need context on what they're touching. BuboMap gives all three a single connected source of truth.",
    type: "website",
    siteName: "BuboMap",
  },
  twitter: {
    card: "summary_large_image",
    title: "BuboMap | The IT estate your whole team can finally see",
    description:
      "A single connected source of truth for IT leaders, architects, and engineers — without heavyweight EA tooling or framework baggage.",
  },
};

const HERO_BADGES = ["Zero TOGAF", "Zero consultants", "Zero Visio"];

const PERSONA_PILLS = [
  { label: "IT leaders", className: "border-orange-500/40 text-orange-400" },
  { label: "Architects", className: "border-violet-500/40 text-violet-400" },
  { label: "IT professionals", className: "border-emerald-500/40 text-emerald-400" },
];

const PERSONA_CARDS = [
  {
    label: "For IT leaders",
    labelClass: "text-orange-400",
    accent: "#f97316",
    title: "Answer executive questions without scrambling",
    body: (
      <>
        Portfolio health, capability gaps, investment mix —{" "}
        <strong className="font-semibold text-white/70">
          board-ready views derived from your actual repository.
        </strong>{" "}
        Not manually assembled every quarter.
      </>
    ),
  },
  {
    label: "For architects",
    labelClass: "text-violet-400",
    accent: "#8b5cf6",
    title: "A model that stays current without heroic effort",
    body: (
      <>
        Every system, capability, and integration is a{" "}
        <strong className="font-semibold text-white/70">real connected object</strong> — not a shape
        on a slide. No more Visio files going stale between reviews.
      </>
    ),
  },
  {
    label: "For IT professionals",
    labelClass: "text-emerald-400",
    accent: "#10b981",
    title: "Know what you're touching before you touch it",
    body: (
      <>
        Who owns this system. What depends on it. What breaks if it goes down.{" "}
        <strong className="font-semibold text-white/70">
          Context that used to live in someone&apos;s head
        </strong>{" "}
        — now in one place.
      </>
    ),
  },
];

const VALUE_CARDS = [
  {
    accent: "#3b82f6",
    title: "Know what breaks before it does",
    body: (
      <>
        Surface tech debt, dependency chains, and end-of-life systems{" "}
        <strong className="font-semibold text-white/70">before they become incidents.</strong> Blast
        radius and severity — not buried in a spreadsheet.
      </>
    ),
  },
  {
    accent: "#ef4444",
    title: "Priced for teams without EA departments",
    body: (
      <>
        LeanIX and Ardoq price out most SMB teams before they start. BuboMap gives you{" "}
        <strong className="font-semibold text-white/70">the same source of truth</strong> without the
        six-figure contract.
      </>
    ),
  },
];

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

function FeatureCard({
  label,
  labelClass,
  accent,
  title,
  children,
}: {
  label?: string;
  labelClass?: string;
  accent: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 text-left transition-colors hover:border-white/[0.14]">
      {label && (
        <p
          className={`mb-3 text-[10px] font-semibold uppercase tracking-wider ${labelClass ?? "text-white/50"}`}
        >
          {label}
        </p>
      )}
      <div className="mb-4 h-0.5 w-8 rounded-full" style={{ backgroundColor: accent }} />
      <h2 className="mb-2 text-base font-semibold text-white">{title}</h2>
      <p className="text-sm leading-relaxed text-white/50">{children}</p>
    </article>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b14] text-white">
      <header className="flex items-center justify-between px-8 py-5">
        <BuboMapWordmark size="md" beta theme="dark" />
        <div className="flex items-center gap-4">
          <Link
            href="#pricing"
            className="text-sm text-white/70 transition-colors hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/auth/sign-in"
            className="text-sm text-white/70 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Get started free
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-8 py-16 text-center">
        <div className="max-w-3xl">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {HERO_BADGES.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/60"
              >
                {badge}
              </span>
            ))}
          </div>

          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight">
            The IT estate your{" "}
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              whole team can finally see.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/60">
            Leaders need visibility. Architects need a model they can maintain. Engineers need context
            on what they&apos;re touching.{" "}
            <strong className="font-semibold text-white/80">
              BuboMap gives all three a single connected source of truth
            </strong>{" "}
            — without the heavyweight tooling or framework baggage.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-indigo-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Get started free
            </Link>
            <Link
              href="/auth/sign-in"
              className="rounded-lg border border-white/20 px-8 py-3 font-semibold text-white transition-colors hover:border-white/40"
            >
              Sign in
            </Link>
          </div>

          <p className="mt-4 text-xs text-white/40">Free for individuals — no credit card required.</p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {PERSONA_PILLS.map((pill) => (
              <span
                key={pill.label}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${pill.className}`}
              >
                {pill.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-20 w-full max-w-5xl">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PERSONA_CARDS.map((card) => (
              <FeatureCard
                key={card.title}
                label={card.label}
                labelClass={card.labelClass}
                accent={card.accent}
                title={card.title}
              >
                {card.body}
              </FeatureCard>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            {VALUE_CARDS.map((card) => (
              <FeatureCard key={card.title} accent={card.accent} title={card.title}>
                {card.body}
              </FeatureCard>
            ))}
          </div>
        </div>

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
              <Link
                href="/auth/sign-up"
                className="mt-7 inline-flex items-center justify-center rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/40"
              >
                Start free
              </Link>
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

        <p className="mt-20 text-xs text-white/25">
          BuboMap · BOO-bo MAP · bubomap.com ·{" "}
          <Link href="/contact" className="transition-colors hover:text-white/50">
            Contact us
          </Link>
        </p>
      </main>
    </div>
  );
}
