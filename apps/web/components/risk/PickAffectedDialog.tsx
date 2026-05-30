"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, productsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { TechDebtAffectsRef } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: TechDebtAffectsRef | null;
  onClose: () => void;
  onApply: (affects: TechDebtAffectsRef | null) => void;
}

type PickItem = TechDebtAffectsRef & { group: string };

export function PickAffectedDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<TechDebtAffectsRef | null>(selected);

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const { data: appsData, isLoading: loadingApps } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
    enabled,
  });

  const { data: componentsData, isLoading: loadingComponents } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "component"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!);
    },
    enabled,
  });

  const items = useMemo(() => {
    const list: PickItem[] = [
      ...(productsData?.items ?? []).map((p) => ({
        object_id: p.id,
        object_name: p.name,
        object_kind: "product" as const,
        group: "Products",
      })),
      ...(appsData?.items ?? []).map((a) => ({
        object_id: a.id,
        object_name: a.name,
        object_kind: "application" as const,
        group: "Systems",
      })),
      ...(componentsData?.items ?? []).map((c) => ({
        object_id: c.id,
        object_name: c.name,
        object_kind: "component" as const,
        group: "Components",
      })),
    ];
    const q = search.trim().toLowerCase();
    return q
      ? list.filter(
          (item) =>
            item.object_name.toLowerCase().includes(q) ||
            item.group.toLowerCase().includes(q)
        )
      : list;
  }, [productsData, appsData, componentsData, search]);

  const isLoading = loadingProducts || loadingApps || loadingComponents;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Affects</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Attach to a product, system, or component
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
              placeholder="Search products, systems, components…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No matches found</p>
          ) : (
            items.map((item) => {
              const key = `${item.object_kind}:${item.object_id}`;
              const isSelected = picked?.object_id === item.object_id && picked.object_kind === item.object_kind;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setPicked({
                      object_id: item.object_id,
                      object_name: item.object_name,
                      object_kind: item.object_kind,
                    })
                  }
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isSelected ? "bg-red-50 text-red-900" : "hover:bg-gray-50 text-gray-800"
                  )}
                >
                  <span className="font-medium block truncate">{item.object_name}</span>
                  <span className="text-[11px] text-gray-400">{item.group}</span>
                </button>
              );
            })
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
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md disabled:bg-red-300 disabled:text-red-100"
          >
            Apply
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
