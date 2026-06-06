"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Zap } from "lucide-react";
import {
  API_CRITICALITY_STYLE,
  API_STATUS_STYLE,
} from "@/lib/api-utils";
import {
  EVENT_CRITICALITY_LABEL,
  formatSubscribersLine,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/event-utils";
import {
  eventCriticalityLabel,
  eventDeliveryLabel,
  eventProducerName,
  eventProps,
  eventTopic,
  sortEvents,
  type EventSortKey,
} from "@/lib/event-list-utils";
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

export function EventTable({
  items,
  onOpen,
}: {
  items: MinEAObject[];
  onOpen: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<EventSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: EventSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return sortEvents(items, sortKey, sortDir);
  }, [items, sortKey, sortDir]);

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <SortHeader label="Name" active={sortKey === "name"} onClick={() => toggleSort("name")} />
            <SortHeader label="Topic" active={sortKey === "topic"} onClick={() => toggleSort("topic")} />
            <SortHeader label="Producer" active={sortKey === "producer"} onClick={() => toggleSort("producer")} />
            <SortHeader label="Subscribers" active={sortKey === "subscribers"} onClick={() => toggleSort("subscribers")} />
            <SortHeader label="Delivery" active={sortKey === "delivery"} onClick={() => toggleSort("delivery")} />
            <SortHeader label="Criticality" active={sortKey === "criticality"} onClick={() => toggleSort("criticality")} />
            <SortHeader label="Owner" active={sortKey === "owner"} onClick={() => toggleSort("owner")} />
            <SortHeader label="Status" active={sortKey === "status"} onClick={() => toggleSort("status")} />
            <SortHeader label="Updated" active={sortKey === "updated"} onClick={() => toggleSort("updated")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const props = eventProps(item);
            const status = item.status ?? "planned";
            const criticality = props.criticality ?? "low";
            const subscribers = props.subscribers ?? [];

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
                      <Zap size={13} />
                    </div>
                    <span className="font-medium text-gray-900 truncate">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs font-mono truncate max-w-[140px]">
                  {eventTopic(item) || "—"}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[140px]">
                  {eventProducerName(item) || "—"}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {subscribers.length > 0 ? formatSubscribersLine(subscribers) : "—"}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {eventDeliveryLabel(item) || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      API_CRITICALITY_STYLE[criticality] ?? API_CRITICALITY_STYLE.low
                    )}
                  >
                    {EVENT_CRITICALITY_LABEL[criticality] ?? eventCriticalityLabel(item) ?? criticality}
                  </span>
                </td>
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
        {sorted.length} event{sorted.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
