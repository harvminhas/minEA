"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { TECH_DEBT_SEVERITY_LABEL } from "@/lib/tech-debt-utils";
import type { RoadmapDebtRef, TechDebtProperties } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: RoadmapDebtRef[];
  candidates?: RoadmapDebtRef[];
  onClose: () => void;
  onApply: (debts: RoadmapDebtRef[]) => void;
}

export function LinkDebtDialog({ selected, candidates, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<RoadmapDebtRef[]>(selected);

  const { data, isLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "tech_debt"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tech_debt" }, token!);
    },
    enabled: enabled && !candidates,
  });

  const debts = useMemo(() => {
    const items =
      candidates ??
      (data?.items ?? []).map((item) => {
        const props = item.properties as TechDebtProperties;
        return {
          debt_id: item.id,
          debt_name: item.name,
          severity: props.severity,
        } satisfies RoadmapDebtRef;
      });
    const q = search.trim().toLowerCase();
    return q ? items.filter((d) => d.debt_name.toLowerCase().includes(q)) : items;
  }, [candidates, data, search]);

  const pickedIds = new Set(picked.map((d) => d.debt_id));

  const toggle = (debt: RoadmapDebtRef) => {
    setPicked((prev) =>
      pickedIds.has(debt.debt_id)
        ? prev.filter((d) => d.debt_id !== debt.debt_id)
        : [...prev, debt]
    );
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Link debt items</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select tech debt this roadmap item resolves</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tech debt…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {(!candidates && isLoading) ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : debts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No tech debt items found</p>
          ) : (
            debts.map((debt) => {
              const isSelected = pickedIds.has(debt.debt_id);
              const showWarning =
                debt.severity === "high" || debt.severity === "critical";
              return (
                <button
                  key={debt.debt_id}
                  type="button"
                  onClick={() => toggle(debt)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-start gap-2",
                    isSelected ? "bg-violet-50 text-violet-900" : "hover:bg-gray-50 text-gray-800"
                  )}
                >
                  {showWarning && (
                    <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0">
                    <span className="font-medium block truncate">{debt.debt_name}</span>
                    {debt.severity && (
                      <span className="text-[11px] text-gray-400">
                        {TECH_DEBT_SEVERITY_LABEL[debt.severity]}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(picked)}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md"
          >
            Apply{picked.length > 0 ? ` (${picked.length})` : ""}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
