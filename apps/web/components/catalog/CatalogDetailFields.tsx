import { catalogLifecycleLabel } from "@/lib/catalog-fields";
import {
  criticalityBadgeStyle,
  criticalityCardLabel,
  lifecycleBadgeStyle,
} from "@/lib/technology-card-utils";
import { cn } from "@/lib/utils";

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span
        className={cn(
          "text-right",
          value === "—" ? "font-normal text-gray-400" : "font-medium text-gray-900"
        )}
      >
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
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>{text}</span>
    </div>
  );
}

/** Shared record fields, shown above type-specific "More details". */
export function CatalogDetailFields({
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
  return (
    <div className="space-y-3 text-sm">
      <FieldRow label="Owner" value={owner} />
      <FieldRow label="Vendor" value={vendor} />
      <FieldRow label="Annual cost" value={annualCost} />
      <FieldRow label="Contract end" value={contractEnd} />
      {lifecycle ? (
        <BadgeRow
          label="Lifecycle"
          text={catalogLifecycleLabel(lifecycle)}
          className={lifecycleBadgeStyle(lifecycle)}
        />
      ) : (
        <FieldRow label="Lifecycle" value="—" />
      )}
      {criticality ? (
        <BadgeRow
          label="Criticality"
          text={criticalityCardLabel(criticality)}
          className={criticalityBadgeStyle(criticality)}
        />
      ) : (
        <FieldRow label="Criticality" value="—" />
      )}
    </div>
  );
}
