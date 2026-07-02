"use client";

import { formFieldClass } from "@/components/ui/FormDrawer";
import {
  UNASSIGNED_DOMAIN_LABEL,
  type DomainSelectOption,
  domainSelectOptionsWithUnassigned,
} from "@/lib/data-domain-assignment";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: DomainSelectOption[];
  disabled?: boolean;
  loading?: boolean;
  /** Use FormDrawer field styling instead of detail-panel spacing. */
  variant?: "detail" | "form";
}

export function DataDomainSelect({
  value,
  onChange,
  options,
  disabled = false,
  loading = false,
  variant = "detail",
}: Props) {
  const selectOptions = domainSelectOptionsWithUnassigned(options);
  const isUnassigned = !value;

  if (loading) {
    return <p className="text-sm text-gray-400">Loading domains…</p>;
  }

  const hint = (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700/90">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" aria-hidden />
      Governance incomplete — assign a domain when ready.
    </p>
  );

  return (
    <div>
      <div className="relative">
        {isUnassigned && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full bg-amber-400"
            aria-hidden
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            variant === "form" ? formFieldClass : "w-full appearance-none rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 pr-8",
            isUnassigned && "pl-7",
            disabled && "disabled:bg-gray-50"
          )}
        >
          {selectOptions.map((option) => (
            <option key={option.value || "unassigned"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {variant === "detail" && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            ▾
          </span>
        )}
      </div>
      {isUnassigned && hint}
    </div>
  );
}

export function DomainAssignmentLabel({ name }: { name: string }) {
  const isUnassigned = name === UNASSIGNED_DOMAIN_LABEL;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {isUnassigned && (
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" aria-hidden />
      )}
      <span className={cn("truncate", isUnassigned && "text-amber-800/90")}>{name}</span>
    </span>
  );
}
