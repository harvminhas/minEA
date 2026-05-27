"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, productsApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import { formFieldClass } from "@/components/ui/FormDrawer";
import type { MinEAObject, Product } from "@minea/types";

const LIFECYCLES = ["planned", "beta", "live", "retiring", "retired"];

interface Props {
  initialValues?: Product;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductForm({ initialValues, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const isEdit = !!initialValues;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [owner, setOwner] = useState(initialValues?.owner ?? "");
  const [productLine, setProductLine] = useState(initialValues?.product_line ?? "");
  const [lifecycle, setLifecycle] = useState(initialValues?.lifecycle ?? "planned");
  const [selectedCaps, setSelectedCaps] = useState<string[]>(
    initialValues?.capability_ids ?? []
  );
  const [capSearch, setCapSearch] = useState("");

  const { data: capabilities } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "capability"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!);
    },
  });

  const allCaps: MinEAObject[] = capabilities?.items ?? [];

  const filteredCaps = capSearch
    ? allCaps.filter((c) => c.name.toLowerCase().includes(capSearch.toLowerCase()))
    : allCaps;

  // Group by owner (business domain) → first tag → "Other"
  const grouped = useMemo(() => {
    const groups: Record<string, MinEAObject[]> = {};
    for (const cap of filteredCaps) {
      const group = cap.owner || cap.tags?.[0] || "Other";
      (groups[group] ??= []).push(cap);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCaps]);

  const toggleCap = (id: string, checked: boolean) =>
    setSelectedCaps((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = {
        name,
        owner: owner || undefined,
        product_line: productLine || undefined,
        lifecycle,
        capability_ids: selectedCaps,
      };
      if (isEdit) {
        return productsApi.update(orgSlug, workspaceSlug, initialValues!.id, body, token!);
      }
      return productsApi.create(orgSlug, workspaceSlug, body, token!);
    },
    onSuccess: (saved) => {
      invalidateProductQueries(queryClient, orgSlug, workspaceSlug, saved.id);
      onSuccess();
    },
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-base">
              {isEdit ? "Edit product" : "New product"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Define a product by the capabilities it delivers
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 mt-0.5 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={formFieldClass}
              placeholder="e.g. Payments"
              autoFocus
            />
          </div>

          {/* Business capabilities */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                Business capabilities <span className="text-red-500">*</span>
              </label>
              {selectedCaps.length > 0 && (
                <span className="text-xs font-medium text-indigo-600">
                  {selectedCaps.length} selected
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2 leading-relaxed">
              What this product delivers. Systems and processes will be inferred from these.
            </p>

            {/* Search */}
            <div className="relative mb-2">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={capSearch}
                onChange={(e) => setCapSearch(e.target.value)}
                placeholder="Search capabilities..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Grouped list */}
            {allCaps.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">
                No capabilities in repository yet. Add some under Repository → Business first.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {grouped.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">No results for "{capSearch}"</p>
                ) : (
                  grouped.map(([group, items]) => (
                    <div key={group}>
                      <div className="bg-gray-50 px-3 py-1.5 sticky top-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          {group}
                        </span>
                      </div>
                      {items.map((cap) => {
                        const maturity = cap.properties?.maturity as string | undefined;
                        return (
                          <label
                            key={cap.id}
                            className="flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50/50 cursor-pointer border-t border-gray-100"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedCaps.includes(cap.id)}
                                onChange={(e) => toggleCap(cap.id, e.target.checked)}
                                className="accent-indigo-600 flex-shrink-0"
                              />
                              <span className="text-sm text-gray-800 truncate">{cap.name}</span>
                            </div>
                            {maturity && (
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                maturity {maturity}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Coverage summary */}
            {selectedCaps.length > 0 && (
              <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
                <p className="text-xs text-indigo-700">
                  <span className="font-medium">
                    Based on these capabilities, this product will cover:
                  </span>{" "}
                  {selectedCaps.length} capabilit
                  {selectedCaps.length === 1 ? "y" : "ies"} selected
                </p>
              </div>
            )}
          </div>

          {/* Details section */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Details
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Lifecycle</label>
                <select
                  value={lifecycle}
                  onChange={(e) => setLifecycle(e.target.value)}
                  className={formFieldClass}
                >
                  {LIFECYCLES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Product line
                </label>
                <input
                  value={productLine}
                  onChange={(e) => setProductLine(e.target.value)}
                  className={formFieldClass}
                  placeholder="Select line..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Owner</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className={formFieldClass}
                placeholder="e.g. Product Team"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {mutation.isError && (
          <p className="px-6 pb-1 text-xs text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0">
          <p className="text-xs text-gray-400 mb-3">
            You can edit systems directly after creating
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!name || mutation.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
            >
              {mutation.isPending ? "Creating..." : isEdit ? "Save changes" : "Create product"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
