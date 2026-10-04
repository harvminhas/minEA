import { REGISTRY, type Editor, type FieldDef } from "@/lib/fields/registry";

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

const INLINE = new Set(["runtime_kind", "location", "os_name", "os_version", "support_ends", "platform_kind"]);

function infraType(editor: Editor): InfraFieldType {
  if (editor === "date") return "date";
  if (editor === "number") return "number";
  if (editor === "owner") return "owner";
  if (editor === "select") return "enum";
  return "text";
}

function fromRegistry(type: "server" | "platform", keys: readonly string[]): InfraField[] {
  return keys.map((key) => {
    const def = REGISTRY[type].find((field) => field.key === key);
    if (!def) throw new Error(`Missing ${type} field ${key}`);
    return toInfraField(def);
  });
}

function toInfraField(def: FieldDef): InfraField {
  return {
    key: def.key,
    label: def.label,
    type: infraType(def.editor),
    options: def.options?.map((option) => ({ key: option.value, label: option.label })),
    table: Boolean(def.table),
    inline: INLINE.has(def.key),
  };
}

export const runtimeFields: InfraField[] = fromRegistry("server", [
  "runtime_kind",
  "location",
  "os_name",
  "os_version",
  "support_ends",
  "end_of_life",
  "commitment_ends",
  "notice_period",
  "vendor",
  "runtime_provider",
]);

export const platformFields: InfraField[] = fromRegistry("platform", [
  "platform_kind",
  "hosting_model",
  "vendor",
  "vendor_product",
  "contract_renewal",
  "notice_period",
]);

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
