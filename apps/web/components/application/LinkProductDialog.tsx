"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { cn } from "@/lib/utils";

interface Props {
  linkedProductIds: string[];
  onClose: () => void;
  onLink: (productId: string) => void;
  isLinking?: boolean;
}

export function LinkProductDialog({
  linkedProductIds,
  onClose,
  onLink,
  isLinking = false,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [search, setSearch] = useState("");

  const linkedIds = useMemo(() => new Set(linkedProductIds), [linkedProductIds]);

  const { data, isLoading } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const products = useMemo(() => {
    const items = (data?.items ?? []).filter((product) => !linkedIds.has(product.id));
    const q = search.trim().toLowerCase();
    return q ? items.filter((p) => p.name.toLowerCase().includes(q)) : items;
  }, [data, linkedIds, search]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[100]" onClick={isLinking ? undefined : onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] bg-white rounded-xl shadow-2xl z-[110] flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Link product</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Add this system to a product&apos;s scope
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLinking}
            className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-b border-gray-100 divide-y divide-gray-50">
          {isLoading ? (
            <p className="text-sm text-gray-400 px-5 py-4">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">
              {linkedIds.size > 0 && (data?.items ?? []).length > 0
                ? "All products are already linked to this system."
                : "No products found."}
            </p>
          ) : (
            products.map((product) => (
              <button
                key={product.id}
                type="button"
                disabled={isLinking}
                onClick={() => onLink(product.id)}
                className={cn(
                  "w-full text-left px-5 py-3 text-sm hover:bg-indigo-50 transition-colors disabled:opacity-50",
                  "text-gray-700"
                )}
              >
                <span className="font-medium">{product.name}</span>
                {product.product_line && (
                  <span className="text-xs text-gray-400 ml-2">{product.product_line}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLinking}
            className="w-full border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
