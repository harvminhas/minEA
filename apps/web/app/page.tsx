import Link from "next/link";
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
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5">
        <BuboMapWordmark size="md" beta theme="dark" />
        <div className="flex items-center gap-4">
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
        </div>

        {/* Feature cards */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
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

        {/* Footer note */}
        <p className="mt-16 text-xs text-white/25">
          BuboMap · BOO-bo MAP · bubomap.com
        </p>
      </main>
    </div>
  );
}
