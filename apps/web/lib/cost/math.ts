export type CostLineType =
  | "subscription"
  | "support_maintenance"
  | "hosting"
  | "services_one_time"
  | "internal_estimate"
  | "other";

export type CostFrequency = "monthly" | "annual" | "one_time";

export type CostCalculation =
  | { kind: "flat" }
  | { kind: "per_user"; seats: number; unit_price_monthly_cents: number }
  | { kind: "pct_of_license"; pct_bp: number; license_amount_cents: number };

export type CostLine = {
  id: string;
  type: CostLineType;
  label?: string;
  amount_cents?: number;
  frequency: CostFrequency;
  calculation: CostCalculation;
  vendor: string | null;
  source: "estimate" | "quote" | "invoice";
  one_time_date?: string;
  renewal_date?: string;
  notice_days?: number;
  auto_renew?: boolean;
  notes?: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  migrated_from?: "annual_cost";
};

export const COST_TYPE_LABEL: Record<CostLineType, string> = {
  subscription: "Subscription",
  support_maintenance: "Support / maintenance",
  hosting: "Hosting",
  services_one_time: "Services (one-time)",
  internal_estimate: "Internal (est.)",
  other: "Other",
};

/** Existing annual_cost parser. A number or a numeric string above zero counts. Zero and blank do not. */
export function parseLegacyAnnualCost(value: unknown): number | null {
  if (typeof value === "number") return value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned || /[a-z]/i.test(cleaned)) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function lineAnnualCents(line: CostLine): number {
  const calc = line.calculation;
  if (calc.kind === "per_user") return calc.seats * calc.unit_price_monthly_cents * 12;
  if (calc.kind === "pct_of_license") return Math.round((calc.license_amount_cents * calc.pct_bp) / 10000);
  const amount = line.amount_cents ?? 0;
  if (line.frequency === "monthly") return amount * 12;
  if (line.frequency === "one_time") return 0;
  return amount;
}

export function isInternal(line: CostLine): boolean {
  return line.type === "internal_estimate";
}

export function isOneTime(line: CostLine): boolean {
  return line.frequency === "one_time";
}

export function runCents(lines: CostLine[]): number {
  return lines.reduce((sum, line) => (isInternal(line) || isOneTime(line) ? sum : sum + lineAnnualCents(line)), 0);
}

export function totalCents(lines: CostLine[]): number {
  return lines.reduce((sum, line) => (isOneTime(line) ? sum : sum + lineAnnualCents(line)), 0);
}

export function oneTimeCents(lines: CostLine[]): number {
  return lines.reduce((sum, line) => (isOneTime(line) ? sum + (line.amount_cents ?? 0) : sum), 0);
}

export function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function lineTitle(line: CostLine): string {
  return line.label?.trim() || COST_TYPE_LABEL[line.type];
}

const NUMBER_TYPES = new Set(["application", "solution", "technical_capability"]);

export function annualCostWriteBack(objectType: string, lines: CostLine[]): number | string | null {
  const dollars = dollarsFromCents(runCents(lines));
  if (dollars <= 0) return null;
  if (NUMBER_TYPES.has(objectType)) return dollars;
  return Number.isInteger(dollars) ? String(dollars) : String(dollars);
}

export function readCostLines(properties: Record<string, unknown> | null | undefined): CostLine[] | null {
  const raw = properties?.cost_lines;
  if (!Array.isArray(raw)) return null;
  return raw as CostLine[];
}
