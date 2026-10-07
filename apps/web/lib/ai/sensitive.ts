import type { HoldsData } from "@minea/types";

export type SensitiveKind = Exclude<HoldsData, "none">;

const ORDER: HoldsData[] = ["customer", "financial", "employee", "none"];

export const HOLDS_DATA_LABEL: Record<HoldsData, string> = {
  customer: "Customer",
  financial: "Financial",
  employee: "Employee",
  none: "None",
};

const CATEGORY_DEFAULTS: Record<string, SensitiveKind[]> = {
  crm: ["customer"],
  cx: ["customer"],
  commerce: ["customer"],
  finance: ["financial"],
  erp: ["customer", "financial"],
  hr: ["employee"],
};

const PLATFORM_DEFAULTS: Record<string, SensitiveKind[]> = {
  crm: ["customer"],
  erp: ["customer", "financial"],
};

type SensitiveHost = { type: string; properties?: Record<string, unknown> | null };

/** Allowed values in a fixed order; "none" only on its own (it wins over nothing, loses to a real kind). */
export function readHoldsData(value: unknown): HoldsData[] {
  if (!Array.isArray(value)) return [];
  const picked = ORDER.filter((kind) => value.includes(kind));
  const real = picked.filter((kind) => kind !== "none");
  return real.length ? real : picked;
}

/** Toggle one option in the picker: None clears the rest, a real kind clears None. */
export function toggleHoldsData(current: HoldsData[], kind: HoldsData): HoldsData[] {
  if (current.includes(kind)) return current.filter((item) => item !== kind);
  if (kind === "none") return ["none"];
  return readHoldsData([...current.filter((item) => item !== "none"), kind]);
}

/** §6.2 defaults from the application category or platform type (shown as "suggested"). */
export function suggestedHoldsData(record: SensitiveHost): SensitiveKind[] {
  const props = record.properties ?? {};
  if (record.type === "cloud_service") {
    const platformType = typeof props.platform_type === "string" ? props.platform_type : "";
    return PLATFORM_DEFAULTS[platformType] ?? [];
  }
  const category = typeof props.category === "string" ? props.category.trim().toLowerCase() : "";
  return CATEGORY_DEFAULTS[category] ?? [];
}

/** §6.2 steps 1-2 for one record (the data_store hop arrives with the report in Step E). */
export function sensitiveKinds(record: SensitiveHost): Set<SensitiveKind> {
  const stored = record.properties?.holds_data;
  if (Array.isArray(stored)) {
    return new Set(readHoldsData(stored).filter((kind): kind is SensitiveKind => kind !== "none"));
  }
  return new Set(suggestedHoldsData(record));
}

export function isCustomerOrFinancial(record: SensitiveHost): boolean {
  const kinds = sensitiveKinds(record);
  return kinds.has("customer") || kinds.has("financial");
}

export function holdsDataLabel(kinds: readonly HoldsData[]): string {
  return kinds.map((kind) => HOLDS_DATA_LABEL[kind]).join(", ");
}
