"use client";

import { useState } from "react";
import Link from "next/link";
import {
  buildDashboardViewCards,
  buildViewRequirements,
  type DashboardViewCard,
  type ViewStatusTone,
  type WorkspaceMetrics,
} from "@/lib/workspace-dashboard";
import { ViewDetailDrawer } from "@/components/dashboard/ViewDetailDrawer";
import { cn } from "@/lib/utils";

function viewStatusClass(tone: ViewStatusTone): string {
  switch (tone) {
    case "healthy":
      return "text-emerald-600";
    case "action":
      return "text-amber-600";
    default:
      return "text-gray-400";
  }
}

function ViewCardButton({
  card,
  selected,
  onSelect,
}: {
  card: DashboardViewCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all w-full",
        selected
          ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200"
          : "border-gray-100 bg-gray-50/50 hover:border-indigo-200/70 hover:bg-indigo-50/30"
      )}
    >
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
        style={{ backgroundColor: `${card.iconColor}15` }}
      >
        <Icon size={16} style={{ color: card.iconColor }} />
      </span>
      <span className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-semibold leading-snug transition-colors",
            selected ? "text-indigo-900" : "text-gray-800 group-hover:text-indigo-800"
          )}
        >
          {card.label}
        </p>
        <p
          className={cn(
            "text-[10px] font-medium mt-0.5 flex items-center gap-1",
            viewStatusClass(card.statusTone)
          )}
        >
          {card.statusTone === "healthy" && (
            <span className="h-1 w-1 rounded-full bg-emerald-400 inline-block" />
          )}
          {card.statusTone === "action" && (
            <span className="h-1 w-1 rounded-full bg-amber-400 inline-block" />
          )}
          {card.statusLabel}
        </p>
      </span>
    </button>
  );
}

interface Props {
  basePath: string;
  metrics: WorkspaceMetrics;
}

export function DashboardViewsSection({ basePath, metrics }: Props) {
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const viewCards = buildDashboardViewCards(basePath, metrics);
  const selectedCard = viewCards.find((c) => c.id === selectedViewId) ?? null;
  const requirements = selectedCard
    ? buildViewRequirements(selectedCard.id, metrics, basePath)
    : [];

  return (
    <>
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-800">Views</h2>
          <Link
            href={`${basePath}/views`}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            All views
          </Link>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Click a view to see what&apos;s needed before you open it.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {viewCards.map((card) => (
            <ViewCardButton
              key={card.id}
              card={card}
              selected={selectedViewId === card.id}
              onSelect={() => setSelectedViewId(card.id)}
            />
          ))}
        </div>
      </section>

      <ViewDetailDrawer
        card={selectedCard}
        requirements={requirements}
        onClose={() => setSelectedViewId(null)}
      />
    </>
  );
}
