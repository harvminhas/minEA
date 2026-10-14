"use client";

import { useState } from "react";
import {
  CLOUD_PROVIDERS,
  SAAS_PROVIDERS,
  defaultTenantName,
  providerInfo,
  regionChoices,
  type CloudProvider,
  type CustomRegion,
  type HostingDetail,
  type Region,
  type TenantOption,
} from "@/lib/hosting/cloud";

const NEW = "__new";
const CUSTOM = "__custom";

const optionText = (region: Region) => (region.note ? `${region.name} · ${region.note}` : region.name);

/**
 * Provider → tenant/account (pick one, or + new) → region (pick: this tenant's regions first, then
 * the provider's built-in regions and the workspace's custom ones, or + custom). No free typing of
 * regions: a typed custom name is matched to a built-in region first. Presentational: the caller saves.
 */
export function CloudPicker({
  mode,
  value,
  tenants,
  custom = [],
  onChange,
  onAddRegion,
  disabled,
}: {
  mode: "own_cloud" | "saas";
  value: HostingDetail;
  tenants: TenantOption[];
  custom?: CustomRegion[];
  onChange: (next: HostingDetail) => void;
  /** "+ Custom region": returns the region key (a built-in one when the name matches). */
  onAddRegion?: (provider: CloudProvider, name: string) => Promise<string>;
  disabled?: boolean;
}) {
  const providers = mode === "own_cloud" ? CLOUD_PROVIDERS : SAAS_PROVIDERS;
  const provider = value.provider;
  const info = providerInfo(provider);
  const shown = tenants.filter((tenant) => tenant.provider === provider);
  const tenant = value.tenantId ? tenants.find((item) => item.id === value.tenantId) : undefined;
  const typingNew = !value.tenantId && (Boolean(value.tenantName) || shown.length === 0);
  const regions = regionChoices(provider, tenant, custom);
  const [customName, setCustomName] = useState("");
  const [addingRegion, setAddingRegion] = useState(false);
  const [error, setError] = useState("");
  const pickProvider = (next: CloudProvider) => {
    const first = tenants.filter((item) => item.provider === next);
    onChange({ provider: next, ...(first.length === 1 ? { tenantId: first[0]!.id, tenantName: first[0]!.name } : { tenantId: undefined, tenantName: first.length ? "" : defaultTenantName(next) }), regionKey: null });
  };
  const pickTenant = (id: string) => {
    if (id === NEW) onChange({ ...value, tenantId: undefined, tenantName: defaultTenantName(provider) });
    else if (!id) onChange({ ...value, tenantId: undefined, tenantName: "" });
    else onChange({ ...value, tenantId: id, tenantName: tenants.find((item) => item.id === id)?.name ?? "" });
  };
  const addRegion = async () => {
    if (!provider || !onAddRegion || !customName.trim()) return;
    setError("");
    try {
      const key = await onAddRegion(provider, customName.trim());
      onChange({ ...value, regionKey: key });
      setCustomName("");
      setAddingRegion(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that region");
    }
  };
  const select = "mt-0.5 h-8 w-full rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px] text-[#1c2230] disabled:opacity-50";
  return (
    <div data-testid="cloud-picker" className="mt-2 w-full max-w-xl space-y-2 rounded-xl bg-[#f4f7fb] p-2.5 text-[12px] text-[#6b7289]">
      <div role="radiogroup" aria-label="Provider" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1">Provider</span>
        {providers.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={provider === item.id}
            data-provider={item.id}
            disabled={disabled}
            onClick={() => pickProvider(item.id)}
            className={`rounded-full border px-2 py-0.5 ${provider === item.id ? "border-[#5b4ce6] bg-[#ece9ff] text-[#3f35b5]" : "border-[#e6e8ee] bg-white text-[#4b5163]"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {provider && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            {info?.label} {info?.tenantWord}
            <select aria-label="Tenant / account" data-testid="tenant-select" disabled={disabled} value={value.tenantId ?? (typingNew ? NEW : "")} onChange={(event) => pickTenant(event.target.value)} className={select}>
              {mode === "saas" && <option value="">Not recorded</option>}
              {mode === "own_cloud" && shown.length > 0 && !value.tenantId && !typingNew && <option value="">Pick one</option>}
              {shown.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value={NEW}>+ New {info?.tenantWord}…</option>
            </select>
            {typingNew && (
              <input
                aria-label="New tenant name"
                data-testid="tenant-new"
                disabled={disabled}
                value={value.tenantName}
                onChange={(event) => onChange({ ...value, tenantId: undefined, tenantName: event.target.value })}
                className="mt-1 h-8 w-full rounded-lg border border-dashed border-[#a99cf5] bg-white px-2 text-[13px] text-[#1c2230]"
              />
            )}
            {typingNew && <span className="text-[11px]">New platform record</span>}
          </label>
          <label className="block">
            Region (optional)
            <select
              aria-label="Region"
              data-testid="region-select"
              disabled={disabled}
              value={addingRegion ? CUSTOM : value.regionKey ?? ""}
              onChange={(event) => {
                if (event.target.value === CUSTOM) setAddingRegion(true);
                else {
                  setAddingRegion(false);
                  onChange({ ...value, regionKey: event.target.value || null });
                }
              }}
              className={select}
            >
              <option value="">Not recorded</option>
              {regions.used.length > 0 && (
                <optgroup label={tenant ? `Used by ${tenant.name}` : "Used"}>{regions.used.map((region) => <option key={region.key} value={region.key}>{optionText(region)}</option>)}</optgroup>
              )}
              {regions.standard.length > 0 && (
                <optgroup label={`${info?.label} regions`}>{regions.standard.map((region) => <option key={region.key} value={region.key}>{optionText(region)}</option>)}</optgroup>
              )}
              {regions.custom.length > 0 && (
                <optgroup label="Custom">{regions.custom.map((region) => <option key={region.key} value={region.key}>{region.name}</option>)}</optgroup>
              )}
              {value.regionKey && value.regionKey.startsWith("legacy:") && <option value={value.regionKey}>{value.regionKey.slice(7)} (old text)</option>}
              {onAddRegion && <option value={CUSTOM}>+ Custom region…</option>}
            </select>
            {addingRegion && (
              <span className="mt-1 flex gap-1">
                <input aria-label="Custom region name" data-testid="region-custom" value={customName} onChange={(event) => setCustomName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addRegion(); } }} className="h-8 flex-1 rounded-lg border border-dashed border-[#a99cf5] bg-white px-2 text-[13px] text-[#1c2230]" />
                <button type="button" onClick={() => void addRegion()} className="rounded-lg bg-[#5b4ce6] px-2 text-[12px] font-semibold text-white">Add</button>
              </span>
            )}
            {error && <span role="alert" className="text-[11px] text-[#b91c1c]">{error}</span>}
          </label>
        </div>
      )}
    </div>
  );
}
