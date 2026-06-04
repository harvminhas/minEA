import type { ObjectType, TechDebtHostKind } from "@minea/types";

/** Object types that show a Tech debt tab in the repository drawer. */
export const TECH_DEBT_HOST_TYPES: ReadonlySet<ObjectType> = new Set([
  "application",
  "solution",
  "technical_capability",
  "component",
  "api",
  "event",
  "integration_flow",
  "tool",
  "data_object",
  "data_store",
  "data_domain",
  "cloud_service",
  "model",
]);

/** Kinds persisted via affects relationships (not product-only properties). */
export const TECH_DEBT_RELATIONSHIP_TARGETS: ReadonlySet<TechDebtHostKind> = new Set([
  "application",
  "solution",
  "technical_capability",
  "component",
  "api",
  "event",
  "integration_flow",
  "tool",
  "data_object",
  "data_store",
  "data_domain",
  "cloud_service",
  "model",
]);

export function supportsTechDebtTab(type: string): boolean {
  return TECH_DEBT_HOST_TYPES.has(type as ObjectType);
}

export function techDebtHostKindLabel(kind: TechDebtHostKind): string {
  switch (kind) {
    case "product":
      return "Product";
    case "application":
    case "solution":
    case "technical_capability":
      return "System";
    case "component":
      return "Component";
    case "api":
      return "API";
    case "event":
      return "Event";
    case "integration_flow":
      return "Flow";
    case "tool":
      return "Integration infra";
    case "data_object":
      return "Data entity";
    case "data_store":
      return "Data store";
    case "data_domain":
      return "Data domain";
    case "cloud_service":
      return "Platform";
    case "model":
      return "Runtime";
    default:
      return kind;
  }
}
