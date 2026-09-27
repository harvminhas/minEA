import { formatOwnershipLabel } from "@/lib/owner-fields";
import { PLATFORM_LIFECYCLE_LABEL } from "@/lib/platform-utils";
import { formatCurrency } from "@/lib/utils";

export function catalogLifecycleLabel(lifecycle?: string | null): string {
  if (!lifecycle?.trim()) return "—";
  return PLATFORM_LIFECYCLE_LABEL[lifecycle] ?? lifecycle.replace(/_/g, " ");
}

export function formatCatalogAnnualCost(value?: string | number | null): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (!(value > 0)) return "—";
    return formatCurrency(value);
  }
  const trimmed = value.trim();
  return trimmed || "—";
}

export function formatCatalogContractEnd(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed || "—";
}

export function catalogOwnerLabel(entity: {
  owner_team_name?: string | null;
  point_of_contact_name?: string | null;
  owner?: string | null;
}): string {
  return formatOwnershipLabel(entity.owner_team_name, entity.point_of_contact_name, entity.owner);
}

export function isEmptyCatalogValue(value?: string | null): boolean {
  const trimmed = value?.trim();
  return !trimmed || trimmed === "—";
}
