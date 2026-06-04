"use client";

import type { Product, ProductHealthDimensions } from "@minea/types";
import { deriveProductHealthDimensions } from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";

export const PRODUCT_SIGNAL_DIMS: { key: keyof ProductHealthDimensions; label: string }[] = [
  { key: "ops", label: "Ops" },
  { key: "debt", label: "Debt" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "ownership", label: "Ownership" },
];

export const SIGNAL_DIM_DOT: Record<string, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

/** Signal dimension dots with label below each dot (wireframe layout). */
export function ProductSignalDots({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const dims = product.health_dimensions ?? deriveProductHealthDimensions(product);

  return (
    <div className={cn("flex items-end gap-3", className)}>
      {PRODUCT_SIGNAL_DIMS.map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center gap-1 min-w-[2.5rem]">
          <span
            className={cn("h-2 w-2 rounded-full", SIGNAL_DIM_DOT[dims[key]] ?? SIGNAL_DIM_DOT.healthy)}
          />
          <span className="text-[10px] text-gray-500">{label}</span>
        </div>
      ))}
    </div>
  );
}
