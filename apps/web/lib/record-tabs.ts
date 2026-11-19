/** Tabs on capability, activity, and domain record pages. */
export type RecordPageTab = "overview" | "relationships" | "tech_debt" | "history";

const TECH_DEBT = new Set(["tech_debt", "tech-debt", "techdebt"]);

/**
 * Map a URL ?tab= (including legacy panel values like "details") onto a record page tab.
 * ?focus= still lands on Overview so the owner or description editor can open.
 */
export function recordPageTabFromSearch(
  tab?: string | null,
  _focus?: string | null
): RecordPageTab {
  const value = (tab ?? "").trim().toLowerCase();
  if (value === "relationships") return "relationships";
  if (TECH_DEBT.has(value)) return "tech_debt";
  if (value === "history") return "history";
  return "overview";
}

export function recordPageTabQuery(tab: RecordPageTab): string | undefined {
  if (tab === "overview") return undefined;
  return tab;
}
