"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATALOG, PREVIEW_PLANS, type CatalogPlanId } from "@/lib/billing/plans";

/**
 * Dev-only: preview the admin centre as Free/Starter/Team/Business via ?preview=.
 * Display only — the org's real plan is never changed. The parent renders this only
 * when billingPreviewEnabled(), which is always false in production builds.
 */
export function BillingPreviewSwitch({
  preview,
  realLabel,
}: {
  preview: CatalogPlanId | null;
  realLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function choose(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("preview", value);
    else params.delete("preview");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div
      data-testid="billing-preview-switch"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-sm"
    >
      <span className="font-medium text-violet-900">Dev preview</span>
      <label htmlFor="billing-preview" className="text-violet-800">
        Show admin centre as
      </label>
      <select
        id="billing-preview"
        value={preview ?? ""}
        onChange={(e) => choose(e.target.value)}
        className="rounded-md border border-violet-200 bg-white px-2 py-1 text-sm"
      >
        <option value="">Real plan ({realLabel})</option>
        {PREVIEW_PLANS.map((id) => (
          <option key={id} value={id}>
            {CATALOG[id].label}
          </option>
        ))}
      </select>
      <span className="text-xs text-violet-700">
        Display only — the real plan is not changed. Hidden in production.
      </span>
    </div>
  );
}
