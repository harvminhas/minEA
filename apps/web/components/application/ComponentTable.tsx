"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { ComponentQuickAddRow } from "@/components/application/ComponentQuickAddRow";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";
import {
  componentPlatformName,
  componentRuntimeName,
  componentSystemCount,
  componentTechStack,
  componentTypeLabel,
  sortComponents,
  type ComponentSortKey,
} from "@/lib/component-list-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { MinEAObject } from "@minea/types";
import { cn, getObjectInitial, getStatusLabel } from "@/lib/utils";

const COL_COUNT = 9;

const COMPONENT_STATUS_STYLE: Record<string, string> = {
  planned: "bg-stone-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  retiring: "bg-amber-50 text-amber-700",
  retired: "bg-red-50 text-red-500",
};

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

export function ComponentTable({
  items,
  onOpen,
  onCreated,
  defaultQuickAddOpen = false,
}: {
  items: MinEAObject[];
  onOpen: (id: string) => void;
  onCreated: () => void;
  defaultQuickAddOpen?: boolean;
}) {
  const [sortKey, setSortKey] = useState<ComponentSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [quickAddOpen, setQuickAddOpen] = useState(defaultQuickAddOpen);

  const toggleSort = (key: ComponentSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(
    () => (sortKey ? sortComponents(items, sortKey, sortDir) : items),
    [items, sortKey, sortDir]
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr>
              <SortHeader label="Name" active={sortKey === "name"} onClick={() => toggleSort("name")} />
              <SortHeader label="Type" active={sortKey === "type"} onClick={() => toggleSort("type")} />
              <SortHeader
                label="Tech stack"
                active={sortKey === "tech_stack"}
                onClick={() => toggleSort("tech_stack")}
              />
              <SortHeader
                label="Systems"
                active={sortKey === "systems"}
                onClick={() => toggleSort("systems")}
              />
              <SortHeader
                label="Platform"
                active={sortKey === "platform"}
                onClick={() => toggleSort("platform")}
              />
              <SortHeader
                label="Runtime"
                active={sortKey === "runtime"}
                onClick={() => toggleSort("runtime")}
              />
              <SortHeader label="Owner" active={sortKey === "owner"} onClick={() => toggleSort("owner")} />
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
                  No components match your filters.
                </td>
              </tr>
            )}
            {sorted.map((item) => {
              const status = item.status ?? "planned";
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
                        style={{ backgroundColor: APPLICATION_LAYER_COLOR }}
                      >
                        {getObjectInitial(item.name)}
                      </span>
                      <span className="font-semibold text-gray-900 truncate group-hover:text-indigo-700">
                        {item.name}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {componentTypeLabel(item) || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">
                    {componentTechStack(item) || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">
                    {componentSystemCount(item)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">
                    {componentPlatformName(item) || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">
                    {componentRuntimeName(item) || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">
                    {item.owner?.trim() || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        COMPONENT_STATUS_STYLE[status] ?? COMPONENT_STATUS_STYLE.planned
                      )}
                    >
                      {getStatusLabel(status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {updatedLabel || "—"}
                  </td>
                </tr>
              );
            })}
            {quickAddOpen ? (
              <ComponentQuickAddRow
                onCancel={() => setQuickAddOpen(false)}
                onCreated={() => {
                  setQuickAddOpen(false);
                  onCreated();
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
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
