"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { RoadmapProductRef } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  selected: RoadmapProductRef | null;
  onClose: () => void;
  onApply: (product: RoadmapProductRef | null) => void;
}

export function PickProductDialog({ selected, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<RoadmapProductRef | null>(selected);

  const { data, isLoading } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const products = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return q ? items.filter((p) => p.name.toLowerCase().includes(q)) : items;
  }, [data, search]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-full max-w-md bg-white rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">For product</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select the product this roadmap item belongs to</p>
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
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No products found</p>
          ) : (
            products.map((product) => {
              const isSelected = picked?.product_id === product.id;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() =>
                    setPicked({ product_id: product.id, product_name: product.name })
                  }
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isSelected ? "bg-violet-50 text-violet-900" : "hover:bg-gray-50 text-gray-800"
                  )}
                >
                  <span className="font-medium block truncate">{product.name}</span>
                  {product.product_line && (
                    <span className="text-[11px] text-gray-400">{product.product_line}</span>
                  )}
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
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md disabled:bg-violet-300"
          >
            Apply
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
