import { infraConfig } from "@/lib/infra/infraConfig";

/** One list drives the table columns and the panel editors. A shown field always has an editor type. */

export type InfraFieldType = "text" | "date" | "enum" | "number" | "owner";

export type InfraField = {
  key: string;
  label: string;
  type: InfraFieldType;
  options?: readonly { key: string; label: string }[];
  table: boolean;
  inline: boolean;
};

const EDITABLE: InfraFieldType[] = ["text", "date", "enum", "number", "owner"];

export const runtimeFields: InfraField[] = [
  { key: "runtime_kind", label: "Kind", type: "enum", options: infraConfig.runtimeKinds, table: true, inline: true },
  { key: "location", label: "Location", type: "enum", options: infraConfig.locations, table: true, inline: true },
  { key: "os_name", label: "OS name", type: "text", table: true, inline: true },
  { key: "os_version", label: "OS version", type: "text", table: true, inline: true },
  { key: "support_ends", label: "Support ends", type: "date", table: true, inline: true },
  { key: "end_of_life", label: "End of life", type: "date", table: false, inline: false },
  { key: "commitment_ends", label: "Renewal", type: "date", table: true, inline: false },
  { key: "notice_period", label: "Notice period", type: "text", table: false, inline: false },
  { key: "vendor", label: "Supplier", type: "text", table: false, inline: false },
  { key: "runtime_provider", label: "Provider", type: "text", table: false, inline: false },
];

export const platformFields: InfraField[] = [
  { key: "platform_kind", label: "Kind", type: "enum", options: infraConfig.platformKinds, table: true, inline: true },
  {
    key: "hosting_model",
    label: "Hosting",
    type: "enum",
    options: Object.entries(infraConfig.platformHostingLabels).map(([key, label]) => ({ key, label })),
    table: true,
    inline: false,
  },
  { key: "vendor", label: "Vendor", type: "text", table: true, inline: false },
  { key: "vendor_product", label: "Product", type: "text", table: false, inline: false },
  { key: "contract_renewal", label: "Renewal", type: "date", table: true, inline: false },
  { key: "notice_period", label: "Notice period", type: "text", table: false, inline: false },
];

export function fieldHasEditor(field: InfraField): boolean {
  if (!EDITABLE.includes(field.type)) return false;
  if (field.type === "enum" && !(field.options && field.options.length > 0)) return false;
  return true;
}

export function sortBlanksLast<T>(rows: T[], kindOf: (row: T) => string, nameOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => {
    const ak = kindOf(a).trim();
    const bk = kindOf(b).trim();
    if (!ak && bk) return 1;
    if (ak && !bk) return -1;
    return nameOf(a).localeCompare(nameOf(b));
  });
}
