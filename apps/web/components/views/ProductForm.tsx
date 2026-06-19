"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { capabilityMapApi, productsApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import {
  flattenMapCapabilities,
  resolveToMapCapability,
} from "@/lib/system-capability-utils";
import { formFieldClass } from "@/components/ui/FormDrawer";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import type { Product } from "@minea/types";

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
  const ownership = useOwnershipForm(initialValues);
  const [productLine, setProductLine] = useState(initialValues?.product_line ?? "");
  const [lifecycle, setLifecycle] = useState(initialValues?.lifecycle ?? "planned");
  const [selectedCaps, setSelectedCaps] = useState<string[]>(
    initialValues?.capability_ids ?? []
  );
  const [capSearch, setCapSearch] = useState("");

  const { data: capabilityMapData } = useQuery({
    queryKey: ["capability-map", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.get(orgSlug, workspaceSlug, token!);
    },
  });

  const mapCapabilityRows = useMemo(
    () => (capabilityMapData ? flattenMapCapabilities(capabilityMapData) : []),
    [capabilityMapData]
  );

  const mapCapabilityIdSet = useMemo(
    () => new Set(mapCapabilityRows.map((row) => row.capability.id)),
    [mapCapabilityRows]
  );

  useEffect(() => {
    if (!isEdit || !initialValues?.capability_ids.length || !capabilityMapData) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const resolved = await Promise.all(
        initialValues.capability_ids.map((id) =>
          resolveToMapCapability(orgSlug, workspaceSlug, id, token, capabilityMapData)
        )
      );
      const ids = [
        ...new Set(
          resolved
            .map((r) => r.capabilityId)
            .filter((id) => mapCapabilityIdSet.has(id))
        ),
      ];
      if (!cancelled) setSelectedCaps(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isEdit,
    initialValues,
    capabilityMapData,
    orgSlug,
    workspaceSlug,
    getToken,
    mapCapabilityIdSet,
  ]);

  const filteredRows = useMemo(() => {
    const query = capSearch.trim().toLowerCase();
    if (!query) return mapCapabilityRows;
    return mapCapabilityRows.filter(
      (row) =>
        row.capability.name.toLowerCase().includes(query) ||
        row.domainName.toLowerCase().includes(query)
    );
  }, [mapCapabilityRows, capSearch]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof mapCapabilityRows> = {};
    for (const row of filteredRows) {
      (groups[row.domainName] ??= []).push(row);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRows]);

  const toggleCap = (id: string, checked: boolean) =>
    setSelectedCaps((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const map =
        capabilityMapData ?? (await capabilityMapApi.get(orgSlug, workspaceSlug, token!));
      const resolved = await Promise.all(
        selectedCaps.map((id) => resolveToMapCapability(orgSlug, workspaceSlug, id, token!, map))
      );
      const capability_ids = [
        ...new Set(
          resolved.map((r) => r.capabilityId).filter((id) => mapCapabilityIdSet.has(id))
        ),
      ];
      const body = {
        name,
        ...ownership.toPayload(),
        product_line: productLine || undefined,
        lifecycle,
        capability_ids,
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
      <div className="fixed inset-0 bg-black/20 z-[80]" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-[90] flex flex-col">
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
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
              L2 capabilities from your capability map. Domain product tabs only show links to
              capabilities in that domain.
            </p>

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

            {mapCapabilityRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-3">
                No capabilities on the capability map yet. Add domains and L2 capabilities under
                Strategy → Capability map first.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {grouped.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">No results for &ldquo;{capSearch}&rdquo;</p>
                ) : (
                  grouped.map(([group, items]) => (
                    <div key={group}>
                      <div className="bg-gray-50 px-3 py-1.5 sticky top-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          {group}
                        </span>
                      </div>
                      {items.map(({ capability }) => {
                        const maturity = capability.maturity;
                        return (
                          <label
                            key={capability.id}
                            className="flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50/50 cursor-pointer border-t border-gray-100"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedCaps.includes(capability.id)}
                                onChange={(e) => toggleCap(capability.id, e.target.checked)}
                                className="accent-indigo-600 flex-shrink-0"
                              />
                              <span className="text-sm text-gray-800 truncate">{capability.name}</span>
                            </div>
                            {maturity != null && (
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

            {selectedCaps.length > 0 && (
              <div className="mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
                <p className="text-xs text-indigo-700">
                  <span className="font-medium">
                    Based on these capabilities, this product will cover:
                  </span>{" "}
                  {selectedCaps.length}{" "}
                  {selectedCaps.length === 1 ? "capability" : "capabilities"} selected
                </p>
              </div>
            )}
          </div>

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

            <OwnershipFields value={ownership.value} onChange={ownership.setValue} required={false} />
          </div>
        </div>

        {mutation.isError && (
          <p className="px-6 pb-1 text-xs text-red-600">
            {(mutation.error as Error).message}
          </p>
        )}

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
              disabled={!name || selectedCaps.length === 0 || mutation.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
            >
              {mutation.isPending ? "Saving..." : isEdit ? "Save changes" : "Create product"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
