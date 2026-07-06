"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { SystemQuickAddRow } from "@/components/application/SystemQuickAddRow";
import type { MinEAObject } from "@minea/types";
import {
  sortSystems,
  systemAnnualCost,
  systemAvatarColor,
  systemCategory,
  systemGovernanceValue,
  systemProps,
  systemVendor,
  type SystemSortKey,
} from "@/lib/system-list-utils";
import { systemCategoryDisplay } from "@/lib/system-category";
import {
  governanceStatusBadgeClass,
  SYSTEM_GOVERNANCE_STATUS_LABELS,
} from "@/lib/system-governance";
import { formatUpdatedAgo, SYSTEM_STATUS_STYLE, systemStatusLabel } from "@/lib/system-utils";
import { cn, formatCurrency, getObjectInitial } from "@/lib/utils";

const COL_COUNT = 9;

function SortHeader({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-4 py-2.5 text-left bg-stone-50 border-b border-gray-200", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          active ? "text-gray-700" : "text-gray-400 hover:text-gray-600"
        )}
      >
        {label}
        <ArrowUpDown size={11} className={active ? "text-gray-500" : "text-gray-300"} />
      </button>
    </th>
  );
}

export function SystemTable({
  items,
  categoryOptions,
  onOpen,
  onCreated,
  defaultQuickAddOpen = false,
  readOnly = false,
}: {
  items: MinEAObject[];
  categoryOptions: string[];
  onOpen: (id: string) => void;
  onCreated: (item: MinEAObject) => void;
  defaultQuickAddOpen?: boolean;
  readOnly?: boolean;
}) {
  const [sortKey, setSortKey] = useState<SystemSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [quickAddOpen, setQuickAddOpen] = useState(defaultQuickAddOpen);

  const toggleSort = (key: SystemSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(
    () => (sortKey ? sortSystems(items, sortKey, sortDir) : items),
    [items, sortKey, sortDir]
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr>
              <SortHeader label="Name" active={sortKey === "name"} onClick={() => toggleSort("name")} />
              <SortHeader
                label="Governance"
                active={sortKey === "governance"}
                onClick={() => toggleSort("governance")}
              />
              <SortHeader
                label="Vendor"
                active={sortKey === "vendor"}
                onClick={() => toggleSort("vendor")}
              />
              <SortHeader
                label="Category"
                active={sortKey === "category"}
                onClick={() => toggleSort("category")}
              />
              <SortHeader
                label="Cost/yr"
                active={sortKey === "cost"}
                onClick={() => toggleSort("cost")}
              />
              <SortHeader
                label="Capabilities"
                active={sortKey === "capabilities"}
                onClick={() => toggleSort("capabilities")}
              />
              <SortHeader
                label="Owner"
                active={sortKey === "owner"}
                onClick={() => toggleSort("owner")}
              />
              <SortHeader
                label="Status"
                active={sortKey === "status"}
                onClick={() => toggleSort("status")}
              />
              <SortHeader
                label="Updated"
                active={sortKey === "updated"}
                onClick={() => toggleSort("updated")}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !quickAddOpen && (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-sm text-gray-400">
                  No systems match your filters.
                </td>
              </tr>
            )}
            {sorted.map((item) => {
              const status = item.status ?? "planned";
              const cost = systemAnnualCost(item);
              const category = systemCategory(item);
              const categoryMeta = systemCategoryDisplay(systemProps(item));
              const vendor = systemVendor(item);
              const governance = systemGovernanceValue(item);
              const updatedLabel = [
                item.updated_by_name?.trim(),
                formatUpdatedAgo(item.updated_at),
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-stone-50/80 transition-colors"
                >
                  <td className="px-4 py-3 max-w-[220px]">
                    <button
                      type="button"
                      onClick={() => onOpen(item.id)}
                      className="flex items-center gap-2.5 min-w-0 text-left group"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white text-xs font-bold"
                        style={{ backgroundColor: systemAvatarColor(item.id) }}
                      >
                        {getObjectInitial(item.name)}
                      </span>
                      <span className="font-semibold text-gray-900 truncate group-hover:text-indigo-700">
                        {item.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border",
                        governanceStatusBadgeClass(governance)
                      )}
                    >
                      {SYSTEM_GOVERNANCE_STATUS_LABELS[governance]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{vendor || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <span>{categoryMeta.label || category || "—"}</span>
                      {categoryMeta.needsReview && (
                        <span className="text-[10px] font-medium text-amber-700">Needs review</span>
                      )}
                      {categoryMeta.isCustomBuilt && (
                        <span className="text-[10px] font-medium text-gray-500">Custom-built</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap tabular-nums">
                    {cost != null ? formatCurrency(cost) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">
                    {item.capability_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">
                    {item.owner?.trim() || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        SYSTEM_STATUS_STYLE[status] ?? SYSTEM_STATUS_STYLE.planned
                      )}
                    >
                      {systemStatusLabel(status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {updatedLabel || "—"}
                  </td>
                </tr>
              );
            })}
            {!readOnly &&
              (quickAddOpen ? (
                <SystemQuickAddRow
                  categoryOptions={categoryOptions}
                  onCancel={() => setQuickAddOpen(false)}
                  onCreated={(item) => {
                    setQuickAddOpen(false);
                    onCreated(item);
                  }}
                />
              ) : (
                <tr className="border-t border-gray-200 bg-stone-50/40 hover:bg-stone-50 transition-colors">
                  <td colSpan={COL_COUNT} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setQuickAddOpen(true)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      <Plus size={16} />
                      Quick Add
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
