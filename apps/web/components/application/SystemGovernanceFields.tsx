"use client";

import type { ApplicationProperties } from "@minea/types";
import {
  isShadowGovernance,
  systemGovernanceSelectOptions,
  systemGovernanceStatus,
} from "@/lib/system-governance";
import type { SystemGovernanceStatus } from "@minea/types";
import { FormField, formFieldClass } from "@/components/ui/FormDrawer";
import { cn } from "@/lib/utils";

interface Props {
  governanceStatus: SystemGovernanceStatus;
  onGovernanceStatusChange: (value: SystemGovernanceStatus) => void;
  discovery: string;
  onDiscoveryChange: (value: string) => void;
  className?: string;
}

export function SystemGovernanceFields({
  governanceStatus,
  onGovernanceStatusChange,
  discovery,
  onDiscoveryChange,
  className,
}: Props) {
  const options = systemGovernanceSelectOptions();

  return (
    <div className={cn("space-y-3", className)}>
      <FormField label="Governance status" required>
        <select
          value={governanceStatus}
          onChange={(e) => onGovernanceStatusChange(e.target.value as SystemGovernanceStatus)}
          className={formFieldClass}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">
          Whether IT formally knows about and governs this system — separate from category and
          build origin.
        </p>
        {isShadowGovernance(governanceStatus) && (
          <p className="text-[11px] text-amber-800 mt-1.5 rounded-md border border-amber-100 bg-amber-50 px-2.5 py-2">
            Only name and governance status are required. Add description, vendor, platform, runtime
            links, and other details when you know them — e.g. a marketing SPA on WordPress.
          </p>
        )}
      </FormField>

      <FormField label="Discovery">
        <input
          value={discovery}
          onChange={(e) => onDiscoveryChange(e.target.value)}
          className={formFieldClass}
          placeholder="How was this found?"
          maxLength={500}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Provenance metadata — e.g. &ldquo;Surfaced during Sales interview, not previously tracked
          by IT.&rdquo;
        </p>
      </FormField>
    </div>
  );
}

export function readSystemGovernanceFields(props: ApplicationProperties | undefined): {
  governanceStatus: SystemGovernanceStatus;
  discovery: string;
} {
  return {
    governanceStatus: systemGovernanceStatus(props),
    discovery: props?.discovery?.trim() ?? "",
  };
}
