import Link from "next/link";
import { Check } from "lucide-react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";

const FEATURES = [
  {
    title: "A living model, not a diagram",
    desc: "Every application, integration, and capability is a typed object you can query, link, and reason over. No stale Visio files.",
    color: "#6366f1",
  },
  {
    title: "Clarity on risk and debt",
    desc: "Surface tech debt, blocked initiatives, and end-of-life systems before they become incidents — ranked by severity and business impact.",
    color: "#b45309",
  },
  {
    title: "Investment pipeline, always fresh",
    desc: "Roadmap items roll up to spend, stage, and business impact. Board-ready in minutes, not days.",
    color: "#f59e0b",
  },
  {
    title: "AI that knows your architecture",
    desc: "Ask questions in plain language and get answers grounded in your own model — systems, owners, dependencies, and risk.",
    color: "#10b981",
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5">
        <BuboMapWordmark size="md" beta theme="dark" />
        <div className="flex items-center gap-4">
          <Link
            href="#pricing"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/auth/sign-in"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Get started free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-8 py-20">
        <div className="max-w-3xl">
          {/* Tagline badge */}
          <div className="inline-flex items-center gap-2 mb-6 rounded-full border border-amber-600/40 bg-amber-900/20 px-4 py-1.5 text-xs font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            See the landscape clearly
          </div>

          <h1 className="text-5xl font-bold mb-6 leading-tight tracking-tight">
            Enterprise Architecture{" "}
            <span className="text-indigo-400">as a living model</span>
          </h1>

          <p className="text-xl text-white/60 mb-10 leading-relaxed max-w-2xl mx-auto">
            Map your organisation's capabilities, applications, data flows, and investments.
            Every element is a real object — not a shape on a diagram.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/auth/sign-up"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Start mapping free
            </Link>
            <Link
              href="/auth/sign-in"
              className="border border-white/20 hover:border-white/40 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Sign in
            </Link>
          </div>

          <p className="mt-4 text-xs text-white/40">
            Free for individuals — no credit card required.
          </p>
        </div>

        {/* Feature cards */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl w-full">
          {FEATURES.map((item) => (
            <div
              key={item.title}
              className="bg-white/5 rounded-2xl p-6 text-left border border-white/8 hover:border-white/16 transition-colors"
            >
              <div
                className="h-2 w-8 rounded-full mb-5"
                style={{ backgroundColor: item.color }}
              />
              <h3 className="font-semibold text-base mb-2 text-white">{item.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <section id="pricing" className="mt-28 max-w-3xl w-full scroll-mt-8">
          <h2 className="text-3xl font-bold mb-3 tracking-tight">Simple pricing</h2>
          <p className="text-white/50 mb-10">
            Start free. Upgrade when your team is ready.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
            {/* Free */}
            <div className="bg-white/5 rounded-2xl p-7 border border-white/8 flex flex-col">
              <h3 className="font-semibold text-lg text-white">Free</h3>
              <p className="text-3xl font-bold mt-2">
                $0
                <span className="text-sm font-normal text-white/40"> forever</span>
              </p>
              <p className="text-sm text-white/50 mt-2 mb-6">
                Everything one person needs to map an architecture.
              </p>
              <ul className="space-y-2.5 flex-1">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                    <Check size={15} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/sign-up"
                className="mt-7 inline-flex items-center justify-center border border-white/20 hover:border-white/40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Start free
              </Link>
            </div>

            {/* Business */}
            <div className="bg-indigo-950/40 rounded-2xl p-7 border border-indigo-500/40 flex flex-col">
              <h3 className="font-semibold text-lg text-white">Business</h3>
              <p className="text-3xl font-bold mt-2">
                Contact us
              </p>
              <p className="text-sm text-white/50 mt-2 mb-6">
                For teams that run on their architecture model.
              </p>
              <ul className="space-y-2.5 flex-1">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                    <Check size={15} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={CONTACT_HREF}
                className="mt-7 inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </section>

        {/* Footer note */}
        <p className="mt-20 text-xs text-white/25">
          BuboMap · BOO-bo MAP · bubomap.com ·{" "}
          <Link href="/contact" className="hover:text-white/50 transition-colors">
            Contact us
          </Link>
        </p>
      </main>
    </div>
  );
}
