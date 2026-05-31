"use client";

import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { Product } from "@minea/types";
import { formatDependsSummary, formatProvidesSummary } from "@/lib/portfolio-utils";
import { cn } from "@/lib/utils";

function IntegrationRow({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 text-white",
          iconClass
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>
      </div>
      <p className="text-[11px] text-gray-400 flex-shrink-0 hidden sm:block">{hint}</p>
    </div>
  );
}

/** Compact provides / depends-on rollup for product cockpit cards. */
export function ProductIntegrationsSummary({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-gray-200 bg-stone-50 px-4 py-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Integrations
      </p>
      <div className="divide-y divide-gray-200/80">
        <IntegrationRow
          icon={<ArrowUpRight size={14} strokeWidth={2.5} />}
          iconClass="bg-teal-500"
          label="Provides"
          value={formatProvidesSummary(product)}
          hint="maintenance burden"
        />
        <IntegrationRow
          icon={<ArrowDownLeft size={14} strokeWidth={2.5} />}
          iconClass="bg-orange-400"
          label="Depends on"
          value={formatDependsSummary(product)}
          hint="dependency surface"
        />
      </div>
    </div>
  );
}
