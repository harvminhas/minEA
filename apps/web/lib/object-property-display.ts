import type { AiRole, ObjectType, PlatformRef } from "@minea/types";
import { aiRoleLabel } from "@/lib/ai-role-utils";
import { formatCurrency } from "@/lib/utils";

const APPLICATION_HOSTING_LABEL: Record<string, string> = {
  cloud: "Cloud",
  on_premise: "On premise",
  hybrid: "Hybrid",
  saas: "SaaS",
};

const PROPERTY_LABELS: Record<string, string> = {
  ai_role: "AI role",
  hosting_model: "Hosting model",
  annual_cost: "Annual cost",
  eu_ai_act_risk_class: "EU AI Act risk class",
  autonomy_level: "Autonomy level",
  is_custom_built: "Custom-built",
  category_legacy: "Previous category",
  category_review_required: "Category review",
};

/** Shown elsewhere in the system drawer or stored only for sync. */
const HIDDEN_DETAIL_KEYS = new Set([
  "vendor",
  "annual_cost",
  "platform",
  "category",
  "category_legacy",
  "category_review_required",
  "is_custom_built",
]);

function titleCaseEnum(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function propertyFieldLabel(key: string): string {
  return PROPERTY_LABELS[key] ?? titleCaseEnum(key);
}

export function shouldSkipDetailProperty(key: string): boolean {
  return HIDDEN_DETAIL_KEYS.has(key);
}

export function formatPropertyDisplayValue(
  key: string,
  value: unknown,
  objectType?: ObjectType
): string | null {
  if (value === null || value === undefined || value === "") return null;

  switch (key) {
    case "annual_cost":
      return formatCurrency(Number(value));
    case "ai_role":
      return aiRoleLabel(value as AiRole);
    case "platform": {
      const ref = value as PlatformRef;
      return ref.platform_name?.trim() || null;
    }
    case "hosting_model":
      if (
        objectType === "application" ||
        objectType === "solution" ||
        objectType === "technical_capability"
      ) {
        return APPLICATION_HOSTING_LABEL[String(value)] ?? titleCaseEnum(String(value));
      }
      return titleCaseEnum(String(value));
    case "is_custom_built":
      return value ? "Yes — built in-house" : "No";
    case "category":
      return titleCaseEnum(String(value));
    default:
      if (typeof value === "object") return null;
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (typeof value === "number") return String(value);
      return titleCaseEnum(String(value));
  }
}

export function buildDetailPropertyRows(
  properties: Record<string, unknown>,
  objectType?: ObjectType
): Array<{ key: string; label: string; value: string }> {
  return Object.entries(properties)
    .filter(([key]) => !shouldSkipDetailProperty(key))
    .map(([key, value]) => ({
      key,
      label: propertyFieldLabel(key),
      value: formatPropertyDisplayValue(key, value, objectType),
    }))
    .filter((row): row is { key: string; label: string; value: string } => row.value != null);
}
