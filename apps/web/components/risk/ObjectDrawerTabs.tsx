"use client";

import { cn } from "@/lib/utils";

export type ObjectDrawerTabId = "details" | "overview" | "relationships" | "tech_debt" | "history";

interface Props {
  activeTab: ObjectDrawerTabId;
  onTabChange: (tab: ObjectDrawerTabId) => void;
  openDebtCount?: number;
  relationshipCount?: number;
  showRelationships?: boolean;
  showTechDebt?: boolean;
  showHistory?: boolean;
  /** Defaults to "Relationships". Data entities use "Links". */
  relationshipsTabLabel?: string;
  /** Defaults to the Details tab used by the repository drawer. Record pages pass Overview. */
  firstTab?: { id: "details" | "overview"; label: string };
  historyCount?: number;
  className?: string;
}

export function ObjectDrawerTabs({
  activeTab,
  onTabChange,
  openDebtCount = 0,
  relationshipCount = 0,
  showRelationships = false,
  showTechDebt = true,
  showHistory = true,
  relationshipsTabLabel = "Relationships",
  firstTab = { id: "details", label: "Details" },
  historyCount = 0,
  className,
}: Props) {
  const tabs: {
    id: ObjectDrawerTabId;
    label: string;
    badge?: number;
    badgeTone?: "alert" | "neutral";
  }[] = [{ id: firstTab.id, label: firstTab.label }];
  if (showRelationships) {
    tabs.push({
      id: "relationships",
      label: relationshipsTabLabel,
      badge: relationshipCount > 0 ? relationshipCount : undefined,
      badgeTone: "neutral",
    });
  }
  if (showTechDebt) {
    tabs.push({
      id: "tech_debt",
      label: "Tech debt",
      badge: openDebtCount > 0 ? openDebtCount : undefined,
      badgeTone: "alert",
    });
  }
  if (showHistory) {
    tabs.push({
      id: "history",
      label: "History",
      badge: historyCount > 0 ? historyCount : undefined,
      badgeTone: "neutral",
    });
  }

  return (
    <div className={cn("flex gap-6 overflow-x-auto px-6", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "shrink-0 whitespace-nowrap pb-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5",
            activeTab === tab.id
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          {tab.label}
          {tab.badge != null && (
            <span
              className={cn(
                "inline-flex shrink-0 min-w-[18px] h-[18px] items-center justify-center rounded-full text-[10px] font-bold px-1",
                tab.badgeTone === "alert"
                  ? "bg-red-500 text-white"
                  : "bg-gray-200 text-gray-600"
              )}
            >
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
