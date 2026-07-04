import {
  SYSTEM_CATEGORY_VALUES,
  type ApplicationProperties,
  type SystemCategory,
} from "@minea/types";

export { SYSTEM_CATEGORY_VALUES, type SystemCategory };

export function isKnownSystemCategory(value: string): value is SystemCategory {
  return (SYSTEM_CATEGORY_VALUES as readonly string[]).includes(value);
}

/** Category dropdown options — Other is a valid choice, not a placeholder. */
export function systemCategorySelectOptions(): Array<{ value: SystemCategory; label: string }> {
  return SYSTEM_CATEGORY_VALUES.map((value) => ({ value, label: value }));
}

/** Filters and legacy rows may surface values outside the enum. */
export function mergeCategoryOptions(existing: string[]): string[] {
  const merged = new Set<string>(SYSTEM_CATEGORY_VALUES);
  for (const value of existing) {
    const trimmed = value?.trim();
    if (trimmed) merged.add(trimmed);
  }
  return [...merged].sort((a, b) => a.localeCompare(b));
}

export function systemIsCustomBuilt(props: ApplicationProperties | undefined): boolean {
  return Boolean(props?.is_custom_built);
}

export function systemCategoryNeedsReview(props: ApplicationProperties | undefined): boolean {
  return Boolean(props?.category_review_required);
}

export function formatSystemCategoryLabel(
  category: string | undefined,
  props?: ApplicationProperties
): string {
  if (category?.trim()) return category.trim();
  if (props?.category_legacy?.trim()) return props.category_legacy.trim();
  return "";
}

export function systemCategoryDisplay(
  props: ApplicationProperties | undefined
): { label: string; needsReview: boolean; isCustomBuilt: boolean } {
  const label = formatSystemCategoryLabel(props?.category, props);
  return {
    label,
    needsReview: systemCategoryNeedsReview(props),
    isCustomBuilt: systemIsCustomBuilt(props),
  };
}
