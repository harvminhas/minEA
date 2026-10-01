import {
  dollarsFromCents,
  formatDollars,
  isInternal,
  isOneTime,
  lineAnnualCents,
  oneTimeCents,
  parseLegacyAnnualCost,
  readCostLines,
  runCents,
  totalCents,
} from "@/lib/cost/math";

export type AnnualCost = {
  mode: "lines" | "legacy";
  /** Vendor run total in dollars. Null when there is nothing to add. */
  run: number | null;
  label: string;
  missing: boolean;
};

/** Own recurring cost for one object. Lines win. Otherwise the legacy annual_cost parse. */
export function annualCost(properties: Record<string, unknown> | null | undefined): AnnualCost {
  const props = properties ?? {};
  const lines = readCostLines(props);
  if (lines && lines.length > 0) {
    const run = dollarsFromCents(runCents(lines));
    const total = dollarsFromCents(totalCents(lines));
    const oneTime = dollarsFromCents(oneTimeCents(lines));
    if (total > 0) {
      const tilde = run < total ? "~" : "";
      const extra = oneTime > 0 ? ` + ${formatDollars(oneTime)} one-time` : "";
      return { mode: "lines", run: run > 0 ? run : null, label: `${tilde}${formatDollars(total)}${extra}`, missing: false };
    }
    if (oneTime > 0) {
      return { mode: "lines", run: null, label: `${formatDollars(oneTime)} one-time`, missing: false };
    }
    return { mode: "lines", run: null, label: "—", missing: true };
  }

  const costModel = typeof props.cost_model === "string" ? props.cost_model : "";
  const numeric = parseLegacyAnnualCost(props.annual_cost);
  if (numeric != null) {
    return { mode: "legacy", run: numeric, label: formatDollars(numeric), missing: false };
  }
  if (costModel === "capex") {
    return { mode: "legacy", run: null, label: "Capital asset", missing: false };
  }
  if (props.is_custom_built === true) {
    return { mode: "legacy", run: null, label: "No license cost", missing: false };
  }
  if (typeof props.annual_cost === "string" && props.annual_cost.trim()) {
    return { mode: "legacy", run: null, label: props.annual_cost.trim(), missing: false };
  }
  return { mode: "legacy", run: null, label: "—", missing: true };
}

export type VendorAmount = { vendor: string; dollars: number };

/**
 * Recurring external amounts attributed to a vendor.
 * Lines use the line vendor. A blank line vendor uses the object vendor.
 * One-time lines contribute the vendor name and $0. Internal estimates are skipped.
 * With no billable lines, the legacy annual cost is attributed to the object vendor.
 */
/** Sum of vendor run totals. Callers pass the objects; they do not add the amounts themselves. */
export function runDollarsTotal(propertiesList: Array<Record<string, unknown> | null | undefined>): number {
  return propertiesList.reduce((sum, properties) => sum + (annualCost(properties).run ?? 0), 0);
}

export function vendorAmounts(
  properties: Record<string, unknown> | null | undefined,
  objectVendor: string,
): VendorAmount[] {
  const lines = readCostLines(properties) ?? [];
  const billable = lines.filter((line) => !isInternal(line));
  if (billable.length > 0) {
    return billable.map((line) => ({
      vendor: (line.vendor ?? "").trim() || objectVendor,
      dollars: isOneTime(line) ? 0 : dollarsFromCents(lineAnnualCents(line)),
    }));
  }
  const legacy = annualCost(properties);
  if (!objectVendor) return [];
  return [{ vendor: objectVendor, dollars: legacy.run ?? 0 }];
}
