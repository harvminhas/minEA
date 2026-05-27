"use client";

import Link from "next/link";
import { Plus, Grid3X3, Map, TrendingUp, Sparkles, Zap, Package, BarChart2 } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { NAV_VIEWS } from "@/lib/views";
import type { ViewConfig } from "@/lib/views";

// ─── Miniature illustrations per view ────────────────────────────────────

function CapabilityHeatmapIllustration() {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      {[
        ["bg-emerald-400", "bg-amber-300", "bg-emerald-400"],
        ["bg-red-400", "bg-emerald-400", "bg-gray-200"],
        ["bg-amber-300", "bg-emerald-400", "bg-emerald-400"],
      ].map((row, r) => (
        <div key={r} className="flex gap-1.5">
          {row.map((cls, c) => (
            <div key={c} className={`h-6 flex-1 rounded-sm ${cls} opacity-80`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function JourneysIllustration() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-5">
      {[["bg-indigo-500", "Step 1"], ["bg-emerald-500", "Step 2"], ["bg-amber-500", "Step 3"]].map(
        ([cls, label], i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`h-7 px-3 rounded-md ${cls} flex items-center`}>
              <span className="text-[9px] font-bold text-white">{label}</span>
            </div>
            {i < 2 && <div className="w-4 h-px bg-gray-400" />}
          </div>
        )
      )}
    </div>
  );
}

function ProductsIllustration() {
  return (
    <div className="flex items-end justify-center gap-2 px-4 py-3">
      {[
        { h: "h-10", cls: "bg-indigo-500" },
        { h: "h-14", cls: "bg-violet-400" },
        { h: "h-8", cls: "bg-indigo-300" },
        { h: "h-12", cls: "bg-violet-500" },
        { h: "h-6", cls: "bg-indigo-200" },
      ].map((bar, i) => (
        <div key={i} className={`w-6 rounded-sm ${bar.h} ${bar.cls} opacity-75`} />
      ))}
    </div>
  );
}

function InvestmentsIllustration() {
  return (
    <div className="flex items-end justify-center gap-3 px-4 py-3">
      {[
        { h: "h-8", cls: "bg-amber-400" },
        { h: "h-12", cls: "bg-amber-500" },
        { h: "h-6", cls: "bg-amber-300" },
        { h: "h-14", cls: "bg-orange-500" },
      ].map((bar, i) => (
        <div key={i} className={`w-7 rounded-sm ${bar.h} ${bar.cls} opacity-80`} />
      ))}
    </div>
  );
}

function AiInfraIllustration() {
  return (
    <div className="flex flex-col items-center justify-center py-5 gap-2">
      <Sparkles size={28} className="text-violet-400" />
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 w-6 rounded-full bg-violet-300 opacity-70" />
        ))}
      </div>
    </div>
  );
}

function InsightsIllustration() {
  return (
    <div className="flex flex-col items-center justify-center py-5 gap-2">
      <Zap size={28} className="text-amber-400" />
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-1 w-8 rounded-full bg-amber-300 opacity-70" />
        ))}
      </div>
    </div>
  );
}

const ILLUSTRATIONS: Record<string, () => React.ReactElement> = {
  "capability-heatmap": CapabilityHeatmapIllustration,
  journeys: JourneysIllustration,
  products: ProductsIllustration,
  investments: InvestmentsIllustration,
  "ai-infrastructure": AiInfraIllustration,
  insights: InsightsIllustration,
};

// ─── Gallery card ────────────────────────────────────────────────────────

function GalleryCard({ view, href }: { view: ViewConfig; href: string }) {
  const Illustration = ILLUSTRATIONS[view.id];

  return (
    <Link
      href={href}
      className="group flex flex-col bg-white/70 hover:bg-white border border-white/60 hover:border-violet-200 hover:shadow-lg rounded-2xl overflow-hidden transition-all duration-200"
    >
      {/* Illustration area */}
      <div
        className="h-[110px] flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50 border-b border-violet-100/60"
        style={{ backgroundColor: `${view.color}08` }}
      >
        {Illustration ? (
          <Illustration />
        ) : (
          <view.icon size={32} style={{ color: view.color }} className="opacity-60" />
        )}
      </div>

      {/* Label */}
      <div className="px-4 py-3">
        <p className="font-semibold text-gray-900 text-sm group-hover:text-violet-700 transition-colors">
          {view.label}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">{view.description}</p>
      </div>
    </Link>
  );
}

// ─── New view placeholder card ────────────────────────────────────────────

function NewViewCard() {
  return (
    <div className="flex flex-col bg-transparent border border-violet-200/60 border-dashed rounded-2xl overflow-hidden cursor-not-allowed opacity-70">
      <div className="h-[110px] flex items-center justify-center">
        <Plus size={22} className="text-violet-400" />
      </div>
      <div className="px-4 py-3">
        <p className="font-semibold text-violet-500 text-sm">New view</p>
        <p className="text-[11px] text-violet-400 mt-0.5">Custom lens on your data</p>
      </div>
    </div>
  );
}

// ─── Main gallery ────────────────────────────────────────────────────────

export function ViewsGallery() {
  const { basePath } = useTenancy();

  return (
    <div className="min-h-full px-10 py-10 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Views</h1>
        <p className="text-sm text-gray-500">
          Analytical lenses on your architecture · read-only
        </p>
      </div>

      {/* Gallery grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {NAV_VIEWS.map((view) => (
          <GalleryCard
            key={view.id}
            view={view}
            href={`${basePath}/${view.segment}`}
          />
        ))}
        <NewViewCard />
      </div>

      {/* Mode hint */}
      <p className="mt-8 text-[11px] text-violet-400 text-center">
        Views mode · Purple tint throughout · No sidebar · Read-only analytical context · Gallery of lenses
      </p>
    </div>
  );
}
