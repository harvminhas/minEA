import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm">m</div>
          <span className="font-semibold text-lg">minEA</span>
          <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded text-white/50">beta</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/auth/sign-in" className="text-sm text-white/70 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-8 py-20">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Enterprise Architecture{" "}
            <span className="text-indigo-400">as a living model</span>
          </h1>
          <p className="text-xl text-white/60 mb-10 leading-relaxed">
            Map your organisation's capabilities, applications, data, and integrations.
            Every element is a real object — not a shape on a diagram. Query it with AI.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/auth/sign-up"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Start modelling free
            </Link>
            <Link
              href="/auth/sign-in"
              className="border border-white/20 hover:border-white/40 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-3 gap-8 max-w-3xl w-full">
          {[
            { title: "Business Layer", desc: "Model capabilities and value streams — what your organisation delivers.", color: "#3b82f6" },
            { title: "Application Layer", desc: "Track every application with vendor, cost, owner, and lifecycle status.", color: "#6366f1" },
            { title: "AI Infrastructure", desc: "Govern AI agents, tools, and models. PII access and autonomy risks.", color: "#a855f7" },
          ].map((item) => (
            <div key={item.title} className="bg-white/5 rounded-xl p-6 text-left border border-white/10">
              <div className="h-2 w-2 rounded-full mb-4" style={{ backgroundColor: item.color }} />
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-white/50">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
