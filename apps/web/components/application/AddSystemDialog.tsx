"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { ComponentSystemRef } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: ComponentSystemRef[];
  onClose: () => void;
  onApply: (systems: ComponentSystemRef[]) => void;
}

export function AddSystemDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ComponentSystemRef[]>(selected);

  const { data, isLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
    enabled,
  });

  const systems = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return q ? items.filter((s) => s.name.toLowerCase().includes(q)) : items;
  }, [data, search]);

  const pickedIds = new Set(picked.map((s) => s.system_id));

  const toggle = (id: string, name: string) => {
    setPicked((prev) =>
      pickedIds.has(id)
        ? prev.filter((s) => s.system_id !== id)
        : [...prev, { system_id: id, system_name: name }]
    );
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add systems</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select one or more systems this component belongs to</p>
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
              placeholder="Search systems…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading systems…</p>
          ) : systems.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No systems found</p>
          ) : (
            <ul className="space-y-0.5">
              {systems.map((sys) => {
                const isOn = pickedIds.has(sys.id);
                return (
                  <li key={sys.id}>
                    <button
                      type="button"
                      onClick={() => toggle(sys.id, sys.name)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-3",
                        isOn ? "bg-indigo-50 text-indigo-800" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px]",
                          isOn ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300"
                        )}
                      >
                        {isOn ? "✓" : ""}
                      </span>
                      <span className="truncate">{sys.name}</span>
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
              disabled={picked.length === 0}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
