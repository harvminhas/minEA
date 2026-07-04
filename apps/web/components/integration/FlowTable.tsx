"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowUpDown } from "lucide-react";
import { API_STATUS_STYLE } from "@/lib/api-utils";
import {
  flowProps,
  flowProtocolLabel,
  sortFlows,
  type FlowSortKey,
} from "@/lib/flow-list-utils";
import { flowFromLine, flowToLine, INTEGRATION_LAYER_COLOR } from "@/lib/flow-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { MinEAObject } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";

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

export function FlowTable({
  items,
  onOpen,
}: {
  items: MinEAObject[];
  onOpen: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<FlowSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: FlowSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return sortFlows(items, sortKey, sortDir);
  }, [items, sortKey, sortDir]);

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <SortHeader label="Name" active={sortKey === "name"} onClick={() => toggleSort("name")} />
            <SortHeader label="From" active={sortKey === "from"} onClick={() => toggleSort("from")} />
            <SortHeader label="To" active={sortKey === "to"} onClick={() => toggleSort("to")} />
            <SortHeader
              label="Mechanism"
              active={sortKey === "mechanism"}
              onClick={() => toggleSort("mechanism")}
            />
            <SortHeader label="Owner" active={sortKey === "owner"} onClick={() => toggleSort("owner")} />
            <SortHeader label="Status" active={sortKey === "status"} onClick={() => toggleSort("status")} />
            <SortHeader label="Updated" active={sortKey === "updated"} onClick={() => toggleSort("updated")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const props = flowProps(item);
            const status = item.status ?? "planned";

            return (
              <tr
                key={item.id}
                onClick={() => onOpen(item.id)}
                className="border-b border-gray-100 last:border-0 hover:bg-teal-50/40 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 text-teal-700"
                      style={{ backgroundColor: `${INTEGRATION_LAYER_COLOR}18` }}
                    >
                      <ArrowLeftRight size={13} />
                    </div>
                    <span className="font-medium text-gray-900 truncate">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs max-w-[140px] truncate">
                  {flowFromLine(props)}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs max-w-[140px] truncate">
                  {flowToLine(props)}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{flowProtocolLabel(item) || "—"}</td>
                <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[120px]">
                  {item.owner || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      API_STATUS_STYLE[status] ?? API_STATUS_STYLE.planned
                    )}
                  >
                    {getStatusLabel(status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {formatUpdatedAgo(item.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400">
        {sorted.length} flow{sorted.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
