/** Admin centre tabs on /orgs/{slug}/settings (only when NEXT_PUBLIC_BILLING_UI is on). */

export type AdminTab = "general" | "licences" | "billing";

export const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "licences", label: "Licences" },
  { id: "billing", label: "Plan & billing" },
];

/** null = flag off: the settings page renders every section exactly as before. */
export function resolveAdminTab(raw: string | null | undefined, billingUi: boolean): AdminTab | null {
  if (!billingUi) return null;
  return ADMIN_TABS.some((t) => t.id === raw) ? (raw as AdminTab) : "general";
}

export function adminTabHref(orgSlug: string, tab: AdminTab, preview?: string | null): string {
  const params = new URLSearchParams();
  if (tab !== "general") params.set("tab", tab);
  if (preview) params.set("preview", preview);
  const query = params.toString();
  return `/orgs/${orgSlug}/settings${query ? `?${query}` : ""}`;
}
