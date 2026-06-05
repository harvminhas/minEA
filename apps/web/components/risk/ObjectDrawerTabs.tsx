"use client";

import { cn } from "@/lib/utils";

export type ObjectDrawerTabId = "details" | "relationships" | "tech_debt" | "history";

interface Props {
  activeTab: ObjectDrawerTabId;
  onTabChange: (tab: ObjectDrawerTabId) => void;
  openDebtCount?: number;
  relationshipCount?: number;
  showRelationships?: boolean;
  showTechDebt?: boolean;
  showHistory?: boolean;
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
  className,
}: Props) {
  const tabs: {
    id: ObjectDrawerTabId;
    label: string;
    badge?: number;
    badgeTone?: "alert" | "neutral";
  }[] = [{ id: "details", label: "Details" }];
  if (showRelationships) {
    tabs.push({
      id: "relationships",
      label: "Relationships",
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
    tabs.push({ id: "history", label: "History" });
  }

  return (
    <div className={cn("flex gap-6 px-6", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "pb-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5",
            activeTab === tab.id
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          {tab.label}
          {tab.badge != null && (
            <span
              className={cn(
                "inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full text-[10px] font-bold px-1",
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
