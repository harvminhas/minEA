"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { PRESET_SUBSCRIBERS } from "@/lib/event-utils";
import type { ComponentProperties, EventSubscriberRef } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: EventSubscriberRef[];
  onClose: () => void;
  onApply: (subscribers: EventSubscriberRef[]) => void;
}

function subscriberKey(s: EventSubscriberRef) {
  return s.subscriber_id ?? `custom:${s.subscriber_name}`;
}

export function AddSubscriberDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<EventSubscriberRef[]>(selected);
  const [customName, setCustomName] = useState("");

  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
    enabled,
  });

  const { data: componentsData, isLoading: componentsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "component"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!);
    },
    enabled,
  });

  const repoOptions = useMemo(() => {
    const list: EventSubscriberRef[] = [];
    for (const app of appsData?.items ?? []) {
      list.push({
        subscriber_id: app.id,
        subscriber_name: app.name,
        subscriber_kind: "application",
      });
    }
    for (const comp of componentsData?.items ?? []) {
      const props = (comp.properties ?? {}) as ComponentProperties;
      const systemName = props.systems?.[0]?.system_name;
      list.push({
        subscriber_id: comp.id,
        subscriber_name: systemName ? `${comp.name} (${systemName})` : comp.name,
        subscriber_kind: "component",
      });
    }
    const q = search.trim().toLowerCase();
    return q ? list.filter((s) => s.subscriber_name.toLowerCase().includes(q)) : list;
  }, [appsData, componentsData, search]);

  const pickedKeys = new Set(picked.map(subscriberKey));
  const isLoading = appsLoading || componentsLoading;

  const togglePreset = (name: string) => {
    const key = `custom:${name}`;
    setPicked((prev) =>
      prev.some((s) => subscriberKey(s) === key)
        ? prev.filter((s) => subscriberKey(s) !== key)
        : [...prev, { subscriber_name: name, subscriber_kind: "custom" }]
    );
  };

  const toggleRepo = (sub: EventSubscriberRef) => {
    if (!sub.subscriber_id) return;
    setPicked((prev) => {
      const has = prev.some((s) => s.subscriber_id === sub.subscriber_id);
      return has
        ? prev.filter((s) => s.subscriber_id !== sub.subscriber_id)
        : [...prev, sub];
    });
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name || pickedKeys.has(`custom:${name}`)) return;
    setPicked((prev) => [...prev, { subscriber_name: name, subscriber_kind: "custom" }]);
    setCustomName("");
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add subscribers</h3>
            <p className="text-xs text-gray-400 mt-0.5">Systems or roles that react to this event</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Quick picks</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SUBSCRIBERS.map((name) => {
                const on = pickedKeys.has(`custom:${name}`);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => togglePreset(name)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full border transition-colors",
                      on
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:border-teal-300"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
              placeholder="Custom subscriber name…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customName.trim()}
              className="px-3 py-2 text-sm text-teal-700 border border-teal-200 rounded-md hover:bg-teal-50 disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search systems or components…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
          ) : repoOptions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No matches</p>
          ) : (
            <ul className="space-y-0.5">
              {repoOptions.map((sub) => {
                const isOn = sub.subscriber_id ? pickedKeys.has(sub.subscriber_id) : false;
                return (
                  <li key={sub.subscriber_id}>
                    <button
                      type="button"
                      onClick={() => toggleRepo(sub)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-3",
                        isOn ? "bg-teal-50 text-teal-800" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px]",
                          isOn ? "bg-teal-600 border-teal-600 text-white" : "border-gray-300"
                        )}
                      >
                        {isOn ? "✓" : ""}
                      </span>
                      <span className="truncate">{sub.subscriber_name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400">{picked.length} selected</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={() => onApply(picked)} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md">
              Apply
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
