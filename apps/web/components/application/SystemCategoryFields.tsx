"use client";

import type { ApplicationProperties } from "@minea/types";
import {
  systemCategoryNeedsReview,
  systemCategorySelectOptions,
} from "@/lib/system-category";
import { FormField, formFieldClass } from "@/components/ui/FormDrawer";
import { cn } from "@/lib/utils";

interface Props {
  category: string;
  onCategoryChange: (value: string) => void;
  isCustomBuilt: boolean;
  onCustomBuiltChange: (value: boolean) => void;
  reviewRequired?: boolean;
  legacyCategory?: string;
  className?: string;
}

export function SystemCategoryFields({
  category,
  onCategoryChange,
  isCustomBuilt,
  onCustomBuiltChange,
  reviewRequired = false,
  legacyCategory,
  className,
}: Props) {
  const options = systemCategorySelectOptions();

  return (
    <div className={cn("space-y-3", className)}>
      <FormField label="Category">
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className={formFieldClass}
        >
          <option value="">— Select functional domain —</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">
          What the system does in your estate — not who built it. &ldquo;Other&rdquo; is fine when
          nothing else fits.
        </p>
        {reviewRequired && legacyCategory && (
          <p className="text-[11px] text-amber-700 mt-1.5 rounded-md border border-amber-100 bg-amber-50 px-2.5 py-1.5">
            Previous category &ldquo;{legacyCategory}&rdquo; needs review — pick a functional
            domain above.
          </p>
        )}
      </FormField>

      <FormField label="Custom-built">
        <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer hover:bg-gray-50/80">
          <input
            type="checkbox"
            checked={isCustomBuilt}
            onChange={(e) => onCustomBuiltChange(e.target.checked)}
            className="mt-0.5 accent-indigo-600"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">Custom-built</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">
              No vendor — built and maintained in-house.
            </span>
          </span>
        </label>
      </FormField>
    </div>
  );
}

export function readSystemCategoryFields(props: ApplicationProperties | undefined): {
  category: string;
  isCustomBuilt: boolean;
  reviewRequired: boolean;
  legacyCategory?: string;
} {
  return {
    category: props?.category?.trim() ?? "",
    isCustomBuilt: Boolean(props?.is_custom_built),
    reviewRequired: systemCategoryNeedsReview(props),
    legacyCategory: props?.category_legacy?.trim() || undefined,
  };
}
