"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { mergeCategoryOptions, systemCategorySelectOptions } from "@/lib/system-category";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import type { MinEAObject } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";

const QUICK_ADD_STATUSES = ["planned", "active", "under_evaluation"] as const;

const inputClass =
  "w-full min-w-0 rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function SystemQuickAddRow({
  categoryOptions,
  onCancel,
  onCreated,
}: {
  categoryOptions: string[];
  onCancel: () => void;
  onCreated: (item: MinEAObject) => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const nameRef = useRef<HTMLInputElement>(null);
  const ownership = useOwnershipForm();

  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [isCustomBuilt, setIsCustomBuilt] = useState(false);
  const [annualCost, setAnnualCost] = useState("");
  const [status, setStatus] = useState<(typeof QUICK_ADD_STATUSES)[number]>("planned");
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => mergeCategoryOptions(categoryOptions), [categoryOptions]);
  const categoryChoices = systemCategorySelectOptions();

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("System name is required");

      const properties: Record<string, unknown> = {};
      if (vendor.trim()) properties.vendor = vendor.trim();
      if (category.trim()) properties.category = category.trim();
      properties.is_custom_built = isCustomBuilt;
      const cost = annualCost.trim() ? Number(annualCost.replace(/,/g, "")) : NaN;
      if (!Number.isNaN(cost) && cost > 0) properties.annual_cost = cost;

      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "application",
          name: trimmedName,
          ...ownership.toPayload(),
          status,
          properties,
        },
        token
      );
    },
    onSuccess: (item) => onCreated(item),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not create system");
    },
  });

  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <tr className="border-t border-indigo-100 bg-indigo-50/30">
      <td className="px-4 py-2 min-w-[160px]">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="System name"
          className={inputClass}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) saveMutation.mutate();
          }}
        />
      </td>
      <td className="px-4 py-2 min-w-[120px]">
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Vendor"
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2 min-w-[140px]">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={cn(inputClass, "pr-7 mb-1")}
        >
          <option value="">Category</option>
          {categoryChoices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
          {categories
            .filter((c) => !categoryChoices.some((choice) => choice.value === c))
            .map((c) => (
              <option key={`legacy-${c}`} value={c}>
                {c} (legacy)
              </option>
            ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={isCustomBuilt}
            onChange={(e) => setIsCustomBuilt(e.target.checked)}
            className="accent-indigo-600"
          />
          Custom-built
        </label>
      </td>
      <td className="px-4 py-2 min-w-[100px]">
        <input
          value={annualCost}
          onChange={(e) => setAnnualCost(e.target.value)}
          placeholder="e.g. 50000"
          inputMode="numeric"
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2 text-gray-400 text-sm text-center">—</td>
      <td className="px-4 py-2 min-w-[220px]">
        <OwnershipFields
          value={ownership.value}
          onChange={ownership.setValue}
          required={false}
          teamLabel="Owner"
          pocLabel="Point of contact"
        />
      </td>
      <td className="px-4 py-2 min-w-[110px]">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof QUICK_ADD_STATUSES)[number])}
          className={cn(inputClass, "pr-7")}
        >
          {QUICK_ADD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {getStatusLabel(s)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Esc
          </button>
        </div>
        {error && <p className="text-[10px] text-red-600 mt-1 max-w-[140px]">{error}</p>}
      </td>
    </tr>
  );
}
