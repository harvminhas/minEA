"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import { Cpu, Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { isEnterprisePlatform } from "@/lib/platform-utils";
import type { CloudServiceProperties, ComponentRuntimeRef } from "@minea/types";
import { cn } from "@/lib/utils";

const RUNTIME_KIND_LABEL: Record<ComponentRuntimeRef["runtime_kind"], string> = {
  tool: "Tool",
  model: "Model",
  cloud_service: "Cloud service",
};

interface Props {
  selected: ComponentRuntimeRef | null;
  onClose: () => void;
  onApply: (runtime: ComponentRuntimeRef | null) => void;
}

export function AddRuntimeDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ComponentRuntimeRef | null>(selected);

  const runtimeQueries = useQueries({
    queries: (["tool", "model", "cloud_service"] as const).map((type) => ({
      queryKey: ["objects", orgSlug, workspaceSlug, type],
      queryFn: async () => {
        const token = await getToken();
        return objectsApi.list(orgSlug, workspaceSlug, { type }, token!);
      },
      enabled,
    })),
  });

  const runtimes = useMemo(() => {
    const kinds = ["tool", "model", "cloud_service"] as const;
    const q = search.trim().toLowerCase();
    return kinds.flatMap((kind, i) =>
      (runtimeQueries[i]?.data?.items ?? [])
        .filter(
          (item) =>
            kind !== "cloud_service" ||
            !isEnterprisePlatform((item.properties ?? {}) as CloudServiceProperties)
        )
        .filter((item) => !q || item.name.toLowerCase().includes(q))
        .map((item) => ({
          runtime_id: item.id,
          runtime_name: item.name,
          runtime_kind: kind,
        }))
    );
  }, [runtimeQueries, search]);

  const isLoading = runtimeQueries.some((q) => q.isLoading);
  const pickedKey = picked ? `${picked.runtime_kind}:${picked.runtime_id}` : null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[300] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[310] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Select runtime</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Tool, model, or cloud service this component runs on
            </p>
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
              placeholder="Search runtimes…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading runtimes…</p>
          ) : runtimes.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No runtimes found</p>
          ) : (
            <ul className="space-y-0.5">
              {runtimes.map((rt) => {
                const key = `${rt.runtime_kind}:${rt.runtime_id}`;
                const isOn = pickedKey === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setPicked(isOn ? null : rt)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-3",
                        isOn ? "bg-violet-50 text-violet-800" : "hover:bg-gray-50 text-gray-700"
                      )}
                    >
                      <span className="h-7 w-7 rounded bg-violet-50 flex items-center justify-center flex-shrink-0">
                        <Cpu size={12} className="text-violet-600" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{rt.runtime_name}</span>
                        <span className="block text-[10px] text-gray-400">
                          {RUNTIME_KIND_LABEL[rt.runtime_kind]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear runtime
          </button>
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
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
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
