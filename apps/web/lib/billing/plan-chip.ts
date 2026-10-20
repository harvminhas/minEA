import { CATALOG, type CatalogPlanId } from "@/lib/billing/plans";

/** Small plan label next to the logo: "Free", "Starter", "Business" (legacy Business reads as Business). */
export function planChipLabel(plan: string | null | undefined): string | null {
  const key = (plan ?? "").trim().toLowerCase();
  if (!key) return null;
  return CATALOG[key as CatalogPlanId]?.label ?? null;
}
