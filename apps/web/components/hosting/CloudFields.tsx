"use client";

import { useId } from "react";
import { CLOUD_PROVIDERS, defaultTenantName, findTenant, regionSuggestions, type HostingDetail, type TenantOption } from "@/lib/hosting/cloud";

/**
 * Provider (Our cloud only) + tenant/account (pick one of the org's platforms or type a new name)
 * + optional region (free text, provider suggestions). Presentational: the caller saves.
 * SaaS passes `vendor` instead of letting the person pick a cloud.
 */
export function CloudFields({
  mode,
  value,
  tenants,
  vendor,
  onChange,
  disabled,
}: {
  mode: "own_cloud" | "saas";
  value: HostingDetail;
  tenants: TenantOption[];
  /** SaaS: the catalogue vendor (e.g. Microsoft for Dynamics 365). */
  vendor?: string;
  onChange: (next: HostingDetail) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const provider = mode === "own_cloud" ? value.provider : null;
  const group = provider ? CLOUD_PROVIDERS.find((item) => item.id === provider)?.group : vendor;
  const shown = tenants.filter((tenant) => !group || tenant.group === group);
  const suggestions = regionSuggestions(provider ?? vendor);
  const setTenant = (name: string) => {
    const match = findTenant(tenants, name);
    onChange({ ...value, tenantName: name, tenantId: match?.id });
  };
  return (
    <div data-testid="cloud-fields" className="mt-2 w-full max-w-xl space-y-2 rounded-xl bg-[#f4f7fb] p-2.5 text-[12px] text-[#6b7289]">
      {mode === "own_cloud" && (
        <div role="radiogroup" aria-label="Which cloud" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1">Cloud</span>
          {CLOUD_PROVIDERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={provider === item.id}
              disabled={disabled}
              data-provider={item.id}
              onClick={() => onChange({ ...value, provider: item.id, tenantName: value.tenantName || defaultTenantName(item.id), tenantId: value.tenantName ? value.tenantId : undefined })}
              className={`rounded-full border px-2.5 py-0.5 ${provider === item.id ? "border-[#5b4ce6] bg-[#ece9ff] font-medium text-[#3f35b5]" : "border-[#e6e8ee] bg-white text-[#4b5163]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {mode === "saas" && vendor && <p>Provider <span className="font-medium text-[#1c2230]">{vendor}</span> <span className="text-[#8b90a0]">from catalogue</span></p>}
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          {mode === "own_cloud" ? "Tenant / account" : "Tenant (optional)"}
          <input
            list={`${id}-tenants`}
            value={value.tenantName}
            disabled={disabled}
            onChange={(event) => setTenant(event.target.value)}
            placeholder={defaultTenantName(provider, vendor)}
            aria-label="Tenant or account"
            className="h-8 w-56 rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px] text-[#1c2230] outline-none focus:border-[#c9c6f5]"
          />
          <datalist id={`${id}-tenants`}>{shown.map((tenant) => <option key={tenant.id} value={tenant.name} />)}</datalist>
          {value.tenantName.trim() && !value.tenantId && !findTenant(tenants, value.tenantName) && <span className="text-[11px] text-[#8b90a0]">New platform record</span>}
        </label>
        <label className="flex flex-col gap-1">
          Region (optional)
          <input
            list={`${id}-regions`}
            value={value.region}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, region: event.target.value })}
            placeholder={suggestions[0] ?? "e.g. Canada Central"}
            aria-label="Region"
            className="h-8 w-48 rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px] text-[#1c2230] outline-none focus:border-[#c9c6f5]"
          />
          <datalist id={`${id}-regions`}>{suggestions.map((region) => <option key={region} value={region} />)}</datalist>
        </label>
      </div>
    </div>
  );
}
