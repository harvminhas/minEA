"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { reportPath, reportsPath } from "@/lib/mvp-paths";
import { catalogStats } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";

const GROUPS = [
  { id: "all", label: "All reports", href: (base: string) => reportsPath(base) },
  { id: "spend", label: "Cost & contracts", href: (base: string) => reportPath(base, "spend") },
  { id: "end-of-life", label: "Risk & resilience", href: (base: string) => reportPath(base, "end-of-life") },
  { id: "ownership-gaps", label: "Ownership & upkeep", href: (base: string) => reportPath(base, "ownership-gaps") },
];

export function ReportsSidebar() {
  const pathname = usePathname();
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const stats = catalogStats(catalog.data?.rows ?? []);
  const [savedCount, setSavedCount] = useState(0);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("bubomap-saved-asks");
      setSavedCount(raw ? (JSON.parse(raw) as unknown[]).length : 0);
    } catch {
      setSavedCount(0);
    }
  }, []);

  return (
    <aside className="flex h-full w-[232px] flex-shrink-0 flex-col border-r border-[#e7e8ee] bg-[#f6f7f9]">
      <p className="px-4 pb-2 pt-4 text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">REPORTS</p>
      <nav className="space-y-0.5 px-2">
        {GROUPS.map((group) => {
          const href = group.href(basePath);
          const selected = group.id === "all" ? pathname.endsWith("/reports") : pathname.includes(`/reports/${group.id}`);
          const n =
            group.id === "all"
              ? 8
              : group.id === "spend"
                ? 2
                : group.id === "end-of-life"
                  ? 4
                  : 2;
          return (
            <Link
              key={group.id}
              href={href}
              className={cn(
                "flex items-center rounded-lg px-2.5 py-2 text-[13.5px]",
                selected ? "bg-[#ece9ff] font-semibold text-[#3f35b5]" : "text-[#3c4254] hover:bg-white"
              )}
            >
              <span className="flex-1">{group.label}</span>
              <span className="text-[12px] text-[#8b90a0]">{n}</span>
            </Link>
          );
        })}
        <Link
          href={reportsPath(basePath)}
          className="flex items-center rounded-lg px-2.5 py-2 text-[13.5px] text-[#3c4254] hover:bg-white"
        >
          <span className="flex-1">Saved from Ask</span>
          <span className="text-[12px] text-[#8b90a0]">{savedCount}</span>
        </Link>
      </nav>
      <p className="mt-auto px-4 py-4 text-[12px] leading-5 text-[#8b90a0]">
        Reports refresh from your model. {stats.systems} applications and {stats.infrastructure} infrastructure in view.
      </p>
    </aside>
  );
}
