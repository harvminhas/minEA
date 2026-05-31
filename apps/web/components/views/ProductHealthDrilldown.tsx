"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Product, ProductHealthFactor } from "@minea/types";
import {
  factorSeverityStyle,
  HEALTH_CHIP,
  HEALTH_LABEL,
  productHealthStatus,
} from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";

interface Props {
  product: Product;
  className?: string;
}

export function ProductHealthDrilldown({ product, className }: Props) {
  const [open, setOpen] = useState(false);
  const health = productHealthStatus(product);
  const factors = product.health_factors ?? [];

  return (
    <div className={className}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
          HEALTH_CHIP[health]
        )}
      >
        {HEALTH_LABEL[health]}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {factors.map((factor: ProductHealthFactor) => (
            <div
              key={factor.id}
              className={cn(
                "rounded-md border px-2.5 py-2 text-[11px]",
                factorSeverityStyle(factor.severity)
              )}
            >
              <p className="font-medium">{factor.label}</p>
              <p className="opacity-80 mt-0.5">{factor.action}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
