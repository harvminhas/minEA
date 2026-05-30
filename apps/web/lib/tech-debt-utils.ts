import type { TechDebtProperties } from "@minea/types";

export const RISK_LAYER_COLOR = "#dc2626";

export const TECH_DEBT_SEVERITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export const TECH_DEBT_TYPES = [
  { value: "eol_software", label: "End-of-life software" },
  { value: "security_vulnerability", label: "Security vulnerability" },
  { value: "performance_scaling", label: "Performance / scaling" },
  { value: "missing_tests", label: "Missing tests" },
  { value: "outdated_dependency", label: "Outdated dependency" },
  { value: "compliance_gap", label: "Compliance gap" },
  { value: "documentation", label: "Documentation" },
  { value: "architecture_drift", label: "Architecture drift" },
  { value: "vendor_contract", label: "Vendor / contract" },
  { value: "other", label: "Other…" },
];

export const TECH_DEBT_STATUS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "deferred", label: "Deferred" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't fix" },
];

export const TECH_DEBT_EFFORT = [
  { value: "", label: "—" },
  { value: "s", label: "S — under 2 weeks" },
  { value: "m", label: "M — 2–8 weeks" },
  { value: "l", label: "L — 2–6 months" },
  { value: "xl", label: "XL — 6+ months" },
];

export const TECH_DEBT_SEVERITY_LABEL = Object.fromEntries(
  TECH_DEBT_SEVERITY.map((s) => [s.value, s.label])
);
export const TECH_DEBT_TYPE_LABEL = Object.fromEntries(TECH_DEBT_TYPES.map((t) => [t.value, t.label]));
export const TECH_DEBT_STATUS_LABEL = Object.fromEntries(TECH_DEBT_STATUS.map((s) => [s.value, s.label]));
export const TECH_DEBT_EFFORT_LABEL = Object.fromEntries(TECH_DEBT_EFFORT.map((e) => [e.value, e.label]));

export const SEVERITY_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  low: { border: "border-gray-300", bg: "bg-gray-50", text: "text-gray-700" },
  medium: { border: "border-amber-400", bg: "bg-amber-50", text: "text-amber-800" },
  high: { border: "border-orange-400", bg: "bg-orange-50", text: "text-orange-800" },
  critical: { border: "border-red-500", bg: "bg-red-50", text: "text-red-800" },
};

export function techDebtTypeLabel(props: TechDebtProperties): string {
  if (props.debt_type === "other" && props.debt_type_other?.trim()) {
    return props.debt_type_other.trim();
  }
  return TECH_DEBT_TYPE_LABEL[props.debt_type ?? ""] ?? props.debt_type ?? "";
}

/** Rolling quarters from the current quarter, plus "No target". */
export function buildTargetResolutionOptions(count = 8): { value: string; label: string }[] {
  const now = new Date();
  let year = now.getFullYear();
  let quarter = Math.floor(now.getMonth() / 3) + 1;
  const options: { value: string; label: string }[] = [];

  for (let i = 0; i < count; i++) {
    options.push({ value: `${year}_q${quarter}`, label: `${year} Q${quarter}` });
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }

  options.push({ value: "no_target", label: "No target" });
  return options;
}

export function targetResolutionLabel(value: string | undefined): string {
  if (!value || value === "no_target") return "No target";
  const match = value.match(/^(\d{4})_q(\d)$/);
  if (match) return `${match[1]} Q${match[2]}`;
  return value;
}

export function buildTechDebtProperties(params: {
  severity: string;
  debtType: string;
  debtTypeOther: string;
  debtStatus: string;
  affects: TechDebtProperties["affects"];
  identifiedBy: string;
  targetResolution: string;
  effortEstimate: string;
}): TechDebtProperties {
  return {
    severity: params.severity as TechDebtProperties["severity"],
    debt_type: params.debtType as TechDebtProperties["debt_type"],
    debt_type_other:
      params.debtType === "other" ? params.debtTypeOther.trim() || undefined : undefined,
    debt_status: params.debtStatus as TechDebtProperties["debt_status"],
    affects: params.affects,
    identified_by: params.identifiedBy.trim() || undefined,
    target_resolution: params.targetResolution || undefined,
    effort_estimate: (params.effortEstimate || undefined) as TechDebtProperties["effort_estimate"],
  };
}

export function debtStatusToObjectStatus(
  status: string
): "planned" | "active" | "retiring" | "retired" | "deprecated" | "under_evaluation" {
  switch (status) {
    case "resolved":
    case "wont_fix":
      return "retired";
    case "deferred":
      return "under_evaluation";
    case "in_progress":
      return "active";
    default:
      return "planned";
  }
}
