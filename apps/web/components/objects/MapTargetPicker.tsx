"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CapabilityMap } from "@minea/types";
import { filterMapTargets, flattenMapTargets, groupMapTargets } from "@/lib/system-capability-utils";

export function MapTargetPicker({
  map,
  selectedIds,
  onToggle,
}: {
  map: CapabilityMap | null | undefined;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const targets = useMemo(() => (map ? flattenMapTargets(map) : []), [map]);
  const filtered = useMemo(() => filterMapTargets(targets, query), [targets, query]);
  const groups = useMemo(() => groupMapTargets(filtered), [filtered]);

  return (
    <div data-testid="map-target-picker">
      <p className="text-[11px] text-gray-400 mb-2">
        Link this app at a capability or a specific activity. An app counts once when it rolls up.
      </p>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search capabilities and activities…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {targets.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">
          No capabilities on the capability map yet. Add domains and capabilities under the capability map first.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-3">No results for “{query}”</p>
          ) : (
            groups.map((group) => (
              <div key={group.domainName}>
                <div className="bg-gray-50 px-3 py-1.5 sticky top-0">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group.domainName}</span>
                </div>
                {group.capabilities.map(({ cap, activities }) => (
                  <div key={cap.id}>
                    <TargetRow
                      id={cap.id}
                      name={cap.name}
                      level="Capability"
                      indent={false}
                      checked={selectedIds.includes(cap.id)}
                      onToggle={onToggle}
                    />
                    {activities.map((activity) => (
                      <TargetRow
                        key={activity.id}
                        id={activity.id}
                        name={activity.name}
                        level="Activity"
                        indent
                        checked={selectedIds.includes(activity.id)}
                        onToggle={onToggle}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TargetRow({
  id,
  name,
  level,
  indent,
  checked,
  onToggle,
}: {
  id: string;
  name: string;
  level: "Capability" | "Activity";
  indent: boolean;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <label
      data-testid={`map-target-${id}`}
      className="flex items-center justify-between px-3 py-2 hover:bg-indigo-50/50 cursor-pointer border-t border-gray-100"
    >
      <div className={`flex items-center gap-2.5 min-w-0 ${indent ? "pl-5" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onToggle(id, event.target.checked)}
          className="accent-indigo-600 flex-shrink-0"
        />
        <span className={`text-sm text-gray-800 truncate ${indent ? "" : "font-medium"}`}>{name}</span>
      </div>
      <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{level}</span>
    </label>
  );
}
