import type { HoldsData } from "@minea/types";

export type HoldsKind = Exclude<HoldsData, "none">;
export type SensitiveKind = HoldsKind | "health" | "payment_card";

/** Built-in data types on the Sensitive data page; data_object.properties.sensitive_kind holds one (or "custom"). */
export const DATA_KINDS: { kind: SensitiveKind; label: string; holds: boolean }[] = [
  { kind: "customer", label: "Customer", holds: true },
  { kind: "employee", label: "Employee", holds: true },
  { kind: "financial", label: "Financial", holds: true },
  { kind: "health", label: "Health", holds: false },
  { kind: "payment_card", label: "Payment card", holds: false },
];
const DATA_KIND_SET = new Set<string>(DATA_KINDS.map((item) => item.kind));

/** Data entities that sit behind an app: owns / creates / reads / writes, app → data_object. */
export const DATA_OBJECT_LINKS = new Set(["owns", "creates", "reads", "writes"]);

/** Customer, financial, health and payment card data raise F1; employee data alone doesn't. */
export function isSensitiveKindSet(kinds: ReadonlySet<SensitiveKind>): boolean {
  return kinds.has("customer") || kinds.has("financial") || kinds.has("health") || kinds.has("payment_card");
}

export function dataObjectKind(record: { type: string; properties?: Record<string, unknown> | null }): SensitiveKind | null {
  if (record.type !== "data_object") return null;
  const kind = record.properties?.sensitive_kind;
  return typeof kind === "string" && DATA_KIND_SET.has(kind) ? (kind as SensitiveKind) : null;
}

const ORDER: HoldsData[] = ["customer", "financial", "employee", "none"];

export const HOLDS_DATA_LABEL: Record<HoldsData, string> = {
  customer: "Customer",
  financial: "Financial",
  employee: "Employee",
  none: "None",
};

const CATEGORY_DEFAULTS: Record<string, HoldsKind[]> = {
  crm: ["customer"],
  cx: ["customer"],
  commerce: ["customer"],
  finance: ["financial"],
  erp: ["customer", "financial"],
  hr: ["employee"],
};

const PLATFORM_DEFAULTS: Record<string, HoldsKind[]> = {
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
export function suggestedHoldsData(record: SensitiveHost): HoldsKind[] {
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
  const own = dataObjectKind(record);
  if (record.type === "data_object") return new Set(own ? [own] : []);
  const stored = record.properties?.holds_data;
  if (Array.isArray(stored)) {
    return new Set(readHoldsData(stored).filter((kind): kind is HoldsKind => kind !== "none"));
  }
  return new Set(suggestedHoldsData(record));
}

export function isCustomerOrFinancial(record: SensitiveHost): boolean {
  return isSensitiveKindSet(sensitiveKinds(record));
}

export function holdsDataLabel(kinds: readonly HoldsData[]): string {
  return kinds.map((kind) => HOLDS_DATA_LABEL[kind]).join(", ");
}
