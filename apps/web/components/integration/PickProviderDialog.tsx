"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { ApiProviderRef, ComponentProperties } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: ApiProviderRef | null;
  onClose: () => void;
  onApply: (provider: ApiProviderRef | null) => void;
}

type ProviderOption = ApiProviderRef & { searchLabel: string };

export function PickProviderDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ApiProviderRef | null>(selected);

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

  const options = useMemo(() => {
    const list: ProviderOption[] = [];

    for (const app of appsData?.items ?? []) {
      list.push({
        provider_id: app.id,
        provider_name: app.name,
        provider_kind: "application",
        searchLabel: app.name,
      });
    }

    for (const comp of componentsData?.items ?? []) {
      const props = (comp.properties ?? {}) as ComponentProperties;
      const systemName = props.systems?.[0]?.system_name;
      const label = systemName ? `${comp.name} (${systemName})` : comp.name;
      list.push({
        provider_id: comp.id,
        provider_name: comp.name,
        provider_kind: "component",
        system_name: systemName,
        searchLabel: label,
      });
    }

    const q = search.trim().toLowerCase();
    return q ? list.filter((o) => o.searchLabel.toLowerCase().includes(q)) : list;
  }, [appsData, componentsData, search]);

  const isLoading = appsLoading || componentsLoading;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Select provider</h3>
            <p className="text-xs text-gray-400 mt-0.5">System or component exposing this API</p>
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
              placeholder="Search systems or components…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No providers found</p>
          ) : (
            <ul className="space-y-0.5">
              {options.map((opt) => {
                const isOn =
                  picked?.provider_id === opt.provider_id &&
                  picked?.provider_kind === opt.provider_kind;
                return (
                  <li key={`${opt.provider_kind}-${opt.provider_id}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked({
                          provider_id: opt.provider_id,
                          provider_name: opt.provider_name,
                          provider_kind: opt.provider_kind,
                          system_name: opt.system_name,
                        })
                      }
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                        isOn ? "bg-teal-50 text-teal-800" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <span className="block truncate font-medium">{opt.searchLabel}</span>
                      <span className="text-[10px] text-gray-400 capitalize">{opt.provider_kind}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
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
