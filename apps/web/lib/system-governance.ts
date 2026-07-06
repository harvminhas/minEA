import {
  SYSTEM_GOVERNANCE_STATUS_VALUES,
  type ApplicationProperties,
  type SystemGovernanceStatus,
} from "@minea/types";

export { SYSTEM_GOVERNANCE_STATUS_VALUES, type SystemGovernanceStatus };

export const SYSTEM_GOVERNANCE_STATUS_LABELS: Record<SystemGovernanceStatus, string> = {
  sanctioned: "Sanctioned",
  shadow: "Shadow / informal",
  unknown_provenance: "Unknown provenance",
};

export function isKnownSystemGovernanceStatus(value: string): value is SystemGovernanceStatus {
  return (SYSTEM_GOVERNANCE_STATUS_VALUES as readonly string[]).includes(value);
}

export function systemGovernanceSelectOptions(): Array<{
  value: SystemGovernanceStatus;
  label: string;
}> {
  return SYSTEM_GOVERNANCE_STATUS_VALUES.map((value) => ({
    value,
    label: SYSTEM_GOVERNANCE_STATUS_LABELS[value],
  }));
}

export function systemGovernanceStatus(
  props: ApplicationProperties | undefined
): SystemGovernanceStatus {
  const raw = props?.governance_status?.trim();
  if (raw && isKnownSystemGovernanceStatus(raw)) return raw;
  return "sanctioned";
}

export function isShadowGovernance(status: SystemGovernanceStatus): boolean {
  return status === "shadow";
}

export function systemGovernanceLabel(props: ApplicationProperties | undefined): string {
  return SYSTEM_GOVERNANCE_STATUS_LABELS[systemGovernanceStatus(props)];
}

export function systemDiscovery(props: ApplicationProperties | undefined): string {
  return props?.discovery?.trim() ?? "";
}

export function governanceStatusBadgeClass(status: SystemGovernanceStatus): string {
  switch (status) {
    case "shadow":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "unknown_provenance":
      return "bg-violet-50 text-violet-800 border-violet-200";
    default:
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
}

export function governanceFilterOptions(): Array<{ value: string; label: string }> {
  return [
    { value: "all", label: "All governance" },
    ...SYSTEM_GOVERNANCE_STATUS_VALUES.map((value) => ({
      value,
      label: SYSTEM_GOVERNANCE_STATUS_LABELS[value],
    })),
  ];
}
