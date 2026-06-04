"use client";

import { useState } from "react";
import type { TechDebtHostKind } from "@minea/types";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import { cn } from "@/lib/utils";

interface Props {
  objectId: string;
  objectName: string;
  objectKind: Extract<TechDebtHostKind, "data_object" | "data_store" | "data_domain">;
  links: React.ReactNode;
  onRefresh: () => void;
}

export function DataDetailRightPanel({
  objectId,
  objectName,
  objectKind,
  links,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<"links" | "tech_debt">("links");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(objectId);
  const openCount = techDebtSummary?.open_count ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-6 px-6 pt-4 border-b border-gray-100 flex-shrink-0">
        <button
          type="button"
          onClick={() => setTab("links")}
          className={cn(
            "pb-2.5 text-sm font-medium border-b-2 transition-colors",
            tab === "links"
              ? "border-amber-600 text-amber-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Links
        </button>
        <button
          type="button"
          onClick={() => setTab("tech_debt")}
          className={cn(
            "pb-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5",
            tab === "tech_debt"
              ? "border-amber-600 text-amber-800"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Tech debt
          {openCount > 0 && (
            <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {openCount}
            </span>
          )}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "tech_debt" ? (
          <div className="p-6">
            <ObjectTechDebtTab
              objectId={objectId}
              objectName={objectName}
              objectKind={objectKind}
              summary={techDebtSummary}
              isLoading={techDebtLoading}
              onRefresh={onRefresh}
            />
          </div>
        ) : (
          links
        )}
      </div>
    </div>
  );
}
