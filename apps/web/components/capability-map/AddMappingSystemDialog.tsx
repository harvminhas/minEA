"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

interface Props {
  existingSystemIds: string[];
  onClose: () => void;
  onSelectExisting: (systemId: string) => void;
  onCreateNew: (name: string) => void;
  isSubmitting?: boolean;
}

export function AddMappingSystemDialog({
  existingSystemIds,
  onClose,
  onSelectExisting,
  onCreateNew,
  isSubmitting,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [search, setSearch] = useState("");

  const { data: applications } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
  });

  const filtered = useMemo(() => {
    const items = (applications?.items ?? []).filter((item) => !existingSystemIds.includes(item.id));
    const query = search.trim().toLowerCase();
    if (!query) return items.slice(0, 10);
    return items.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 10);
  }, [applications?.items, existingSystemIds, search]);

  const trimmedSearch = search.trim();
  const canCreate =
    trimmedSearch.length > 0 &&
    !(applications?.items ?? []).some((item) => item.name.toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="add-mapping-system-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h3 id="add-mapping-system-title" className="font-semibold text-gray-900">
              Add system
            </h3>
            <p className="text-sm text-gray-500 mt-1">Add a system column to this domain&apos;s mapping grid.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search systems..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="mt-3 rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-56 overflow-y-auto">
            {filtered.map((item) => {
              const props = item.properties as { category?: string; hosting_model?: string };
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onSelectExisting(item.id)}
                  className={cn("w-full px-3 py-2.5 text-left hover:bg-gray-50")}
                >
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400">
                    {[props.category, props.hosting_model?.replace(/_/g, " ")].filter(Boolean).join(" · ") ||
                      "System"}
                  </p>
                </button>
              );
            })}
            {filtered.length === 0 && !canCreate && (
              <p className="px-3 py-4 text-sm text-gray-400">No available systems</p>
            )}
          </div>

          {canCreate && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onCreateNew(trimmedSearch)}
              className="mt-3 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
            >
              <Plus size={14} />
              Add new: &ldquo;{trimmedSearch}&rdquo;
            </button>
          )}
        </div>
      </div>
    </>
  );
}
