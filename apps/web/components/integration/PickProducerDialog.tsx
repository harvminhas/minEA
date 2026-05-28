"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { ComponentProperties, EventProducerRef } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: EventProducerRef | null;
  onClose: () => void;
  onApply: (producer: EventProducerRef | null) => void;
}

type ProducerOption = EventProducerRef & { searchLabel: string };

export function PickProducerDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<EventProducerRef | null>(selected);

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

  const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "data_object"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "data_object" }, token!);
    },
    enabled,
  });

  const options = useMemo(() => {
    const list: ProducerOption[] = [];

    for (const app of appsData?.items ?? []) {
      list.push({
        producer_id: app.id,
        producer_name: app.name,
        producer_kind: "application",
        searchLabel: app.name,
      });
    }

    for (const comp of componentsData?.items ?? []) {
      const props = (comp.properties ?? {}) as ComponentProperties;
      const systemName = props.systems?.[0]?.system_name;
      const label = systemName ? `${comp.name} (${systemName})` : comp.name;
      list.push({
        producer_id: comp.id,
        producer_name: comp.name,
        producer_kind: "component",
        system_name: systemName,
        searchLabel: label,
      });
    }

    for (const ent of entitiesData?.items ?? []) {
      list.push({
        producer_id: ent.id,
        producer_name: ent.name,
        producer_kind: "data_object",
        searchLabel: `${ent.name} (entity)`,
      });
    }

    const q = search.trim().toLowerCase();
    return q ? list.filter((o) => o.searchLabel.toLowerCase().includes(q)) : list;
  }, [appsData, componentsData, entitiesData, search]);

  const isLoading = appsLoading || componentsLoading || entitiesLoading;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Select producer</h3>
            <p className="text-xs text-gray-400 mt-0.5">System, component, or entity emitting this event</p>
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
              placeholder="Search…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No producers found</p>
          ) : (
            <ul className="space-y-0.5">
              {options.map((opt) => {
                const isOn =
                  picked?.producer_id === opt.producer_id &&
                  picked?.producer_kind === opt.producer_kind;
                return (
                  <li key={`${opt.producer_kind}-${opt.producer_id}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked({
                          producer_id: opt.producer_id,
                          producer_name: opt.producer_name,
                          producer_kind: opt.producer_kind,
                          system_name: opt.system_name,
                        })
                      }
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                        isOn ? "bg-teal-50 text-teal-800" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <span className="block truncate font-medium">{opt.searchLabel}</span>
                      <span className="text-[10px] text-gray-400 capitalize">
                        {opt.producer_kind.replace(/_/g, " ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply(picked)}
            disabled={!picked}
            className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
