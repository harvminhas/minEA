import type { ReactNode } from "react";
import {
  catalogLifecycleLabel,
  isEmptyCatalogValue,
} from "@/lib/catalog-fields";
import {
  criticalityBadgeStyle,
  criticalityCardLabel,
  lifecycleBadgeStyle,
} from "@/lib/technology-card-utils";
import { cn } from "@/lib/utils";

function PropertyRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={cn("text-right truncate max-w-[60%] font-medium text-gray-900", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function BadgeRow({
  label,
  text,
  className,
}: {
  label: string;
  text: string;
  className: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0", className)}>
        {text}
      </span>
    </div>
  );
}

/** The six fields shared by application, infrastructure, and vendor-backed lists. */
export function CatalogCardFields({
  owner,
  vendor,
  annualCost,
  contractEnd,
  lifecycle,
  criticality,
}: {
  owner: string;
  vendor: string;
  annualCost: string;
  contractEnd: string;
  lifecycle?: string | null;
  criticality?: string | null;
}) {
  const lifecycleLabel = lifecycle ? catalogLifecycleLabel(lifecycle) : "—";
  const criticalityLabel = criticality ? criticalityCardLabel(criticality) : "—";

  return (
    <div className="divide-y divide-gray-100 text-xs">
      <PropertyRow
        label="Owner"
        value={owner}
        valueClassName={isEmptyCatalogValue(owner) ? "font-normal text-gray-400" : undefined}
      />
      <PropertyRow
        label="Vendor"
        value={vendor}
        valueClassName={isEmptyCatalogValue(vendor) ? "font-normal text-gray-400" : undefined}
      />
      <PropertyRow
        label="Annual cost"
        value={annualCost}
        valueClassName={isEmptyCatalogValue(annualCost) ? "font-normal text-gray-400" : undefined}
      />
      <PropertyRow
        label="Contract end"
        value={contractEnd}
        valueClassName={isEmptyCatalogValue(contractEnd) ? "font-normal text-gray-400" : undefined}
      />
      {lifecycle ? (
        <BadgeRow
          label="Lifecycle"
          text={lifecycleLabel}
          className={lifecycleBadgeStyle(lifecycle)}
        />
      ) : (
        <PropertyRow label="Lifecycle" value="—" valueClassName="font-normal text-gray-400" />
      )}
      {criticality ? (
        <BadgeRow
          label="Criticality"
          text={criticalityLabel}
          className={criticalityBadgeStyle(criticality)}
        />
      ) : (
        <PropertyRow label="Criticality" value="—" valueClassName="font-normal text-gray-400" />
      )}
    </div>
  );
}
