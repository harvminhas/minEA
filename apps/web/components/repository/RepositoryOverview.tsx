"use client";

import Link from "next/link";
import { useTenancy } from "@/lib/tenancy";
import { useAppStore } from "@/lib/store";
import { useRepositoryNavCounts } from "@/lib/use-repository-nav-counts";
import {
  formatOverviewSubCounts,
  overviewCardTotal,
  REPOSITORY_OVERVIEW_CARDS,
  type RepositoryOverviewCard,
} from "@/lib/repository-overview";
import { cn } from "@/lib/utils";

function OverviewCard({
  card,
  basePath,
  countsBySegment,
  showCounts,
}: {
  card: RepositoryOverviewCard;
  basePath: string;
  countsBySegment: Record<string, number>;
  showCounts: boolean;
}) {
  const Icon = card.icon;
  const total = overviewCardTotal(card, countsBySegment);
  const href = `${basePath}/${card.hrefSegment}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all",
        "hover:border-gray-300 hover:shadow-md",
        card.wide ? "sm:col-span-2" : ""
      )}
    >
      <div className="flex items-start gap-3 mb-4">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${card.color}18` }}
        >
          <Icon size={18} style={{ color: card.color }} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">
            {showCounts ? total : "—"}
          </p>
          <p className="text-sm font-medium text-gray-700 mt-1 group-hover:text-indigo-700 transition-colors">
            {card.label}
          </p>
        </div>
      </div>

      <div className="mt-auto border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          {showCounts ? formatOverviewSubCounts(card, countsBySegment) : "Loading counts…"}
        </p>
      </div>
    </Link>
  );
}

export function RepositoryOverview() {
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { activeOrg, activeWorkspace } = useAppStore();
  const { data: navCounts } = useRepositoryNavCounts(orgSlug ?? "", workspaceSlug ?? "");
  const countsBySegment = navCounts ?? {};
  const showCounts = navCounts !== undefined;

  const orgName = activeOrg?.name ?? "Organization";
  const workspaceName = activeWorkspace?.name ?? "Workspace";

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Repository</h1>
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">
            {orgName} — {workspaceName}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Overview of everything in this workspace — click a card to dive in.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {REPOSITORY_OVERVIEW_CARDS.map((card) => (
          <OverviewCard
            key={card.id}
            card={card}
            basePath={basePath}
            countsBySegment={countsBySegment}
            showCounts={showCounts}
          />
        ))}
      </div>
    </div>
  );
}
