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
import { firstPendingFor, pendingTenantId, type PendingTenant } from "@/lib/hosting/pending-tenants";

const NEW = "__new";
const CUSTOM = "__custom";

/** "Azure tenant", or "Azure tenant 2", "… 3" when that name is already on the list. */
export function newTenantName(provider: CloudProvider | null | undefined, taken: string[]): string {
  const base = defaultTenantName(provider);
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

/** "+ New account": always a named, unused draft, so the new-name box shows even when other cards
 * already added a new account for this provider. */
export function startNewTenant(value: HostingDetail, taken: string[]): HostingDetail {
  return { ...value, tenantId: undefined, tenantShared: false, tenantSharedWith: undefined, tenantName: newTenantName(value.provider, taken) };
}

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
  pending = [],
}: {
  mode: "own_cloud" | "saas";
  value: HostingDetail;
  tenants: TenantOption[];
  custom?: CustomRegion[];
  onChange: (next: HostingDetail) => void;
  /** "+ Custom region": returns the region key (a built-in one when the name matches). */
  onAddRegion?: (provider: CloudProvider, name: string) => Promise<string>;
  disabled?: boolean;
  /** New tenants typed on other cards in this batch, offered as "Name (new)". */
  pending?: PendingTenant[];
}) {
  const providers = mode === "own_cloud" ? CLOUD_PROVIDERS : SAAS_PROVIDERS;
  const provider = value.provider;
  const info = providerInfo(provider);
  const shown = tenants.filter((tenant) => tenant.provider === provider);
  const tenant = value.tenantId ? tenants.find((item) => item.id === value.tenantId) : undefined;
  const ownPendingId = provider && !value.tenantId && value.tenantName.trim() ? pendingTenantId(provider, value.tenantName) : null;
  const sharedPick = value.tenantShared && ownPendingId ? pending.find((item) => item.id === ownPendingId) : undefined;
  // Others' new tenants for this provider; not the one this card is typing itself.
  const pendingShown = pending.filter((item) => item.provider === provider && (sharedPick ? true : item.id !== ownPendingId));
  // "+ New account" is remembered here, not inferred from the name: an empty name used to drop the
  // select straight back to "Pick one", so a second new account could never be started.
  const [creating, setCreating] = useState(false);
  const typingNew = !value.tenantId && !sharedPick && (creating || Boolean(value.tenantName) || shown.length + pendingShown.length === 0);
  const regions = regionChoices(provider, tenant, custom);
  const [customName, setCustomName] = useState("");
  const [addingRegion, setAddingRegion] = useState(false);
  const [error, setError] = useState("");
  const pickProvider = (next: CloudProvider) => {
    setCreating(false);
    const first = tenants.filter((item) => item.provider === next);
    const joined = first.length === 0 ? firstPendingFor(pending, next) : undefined;
    if (joined) {
      onChange({ provider: next, tenantId: undefined, tenantName: joined.name, tenantShared: true, tenantSharedWith: joined.originKey, regionKey: null });
      return;
    }
    onChange({ provider: next, ...(first.length === 1 ? { tenantId: first[0]!.id, tenantName: first[0]!.name } : { tenantId: undefined, tenantName: first.length ? "" : defaultTenantName(next) }), regionKey: null });
  };
  const pickTenant = (id: string) => {
    setCreating(id === NEW);
    const shared = pending.find((item) => item.id === id);
    if (shared) onChange({ ...value, tenantId: undefined, tenantName: shared.name, tenantShared: true, tenantSharedWith: shared.originKey });
    else if (id === NEW) onChange(startNewTenant(value, [...shown, ...pendingShown].map((item) => item.name)));
    else if (!id) onChange({ ...value, tenantId: undefined, tenantShared: false, tenantSharedWith: undefined, tenantName: "" });
    else onChange({ ...value, tenantId: id, tenantShared: false, tenantSharedWith: undefined, tenantName: tenants.find((item) => item.id === id)?.name ?? "" });
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
          <label className="block min-w-0">
            {info?.label} {info?.tenantWord}
            <select aria-label="Tenant / account" data-testid="tenant-select" disabled={disabled} value={value.tenantId ?? sharedPick?.id ?? (typingNew ? NEW : "")} onChange={(event) => pickTenant(event.target.value)} className={select}>
              {mode === "saas" && <option value="">Not recorded</option>}
              {mode === "own_cloud" && shown.length + pendingShown.length > 0 && !value.tenantId && !typingNew && !sharedPick && <option value="">Pick one</option>}
              {shown.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              {pendingShown.map((item) => <option key={item.id} value={item.id} data-pending="1">{item.name} (new)</option>)}
              <option value={NEW}>+ New {info?.tenantWord}…</option>
            </select>
            {typingNew && (
              <input
                aria-label="New tenant name"
                data-testid="tenant-new"
                disabled={disabled}
                value={value.tenantName}
                onChange={(event) => onChange({ ...value, tenantId: undefined, tenantShared: false, tenantSharedWith: undefined, tenantName: event.target.value })}
                placeholder={`Name the new ${info?.tenantWord ?? "account"}`}
                className="mt-1 h-8 w-full rounded-lg border border-dashed border-[#a99cf5] bg-white px-2 text-[13px] text-[#1c2230]"
              />
            )}
            {typingNew && (
              <span className="text-[11px]" data-testid="tenant-new-note">
                {(pending.find((item) => item.id === ownPendingId)?.count ?? 1) > 1 ? "New platform record, same as another card (saved once)" : "New platform record"} · created when you click Add
              </span>
            )}
            {sharedPick && <span className="text-[11px]" data-testid="tenant-shared">New platform record, shared with other cards · created when you click Add</span>}
          </label>
          <label className="block min-w-0">
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
              <span className="mt-1 flex min-w-0 gap-1">
                <input aria-label="Custom region name" data-testid="region-custom" placeholder="Region name" value={customName} onChange={(event) => setCustomName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addRegion(); } }} className="h-8 min-w-0 flex-1 rounded-lg border border-dashed border-[#a99cf5] bg-white px-2 text-[13px] text-[#1c2230]" />
                <button type="button" onClick={() => void addRegion()} className="shrink-0 rounded-lg bg-[#5b4ce6] px-2 text-[12px] font-semibold text-white">Add</button>
              </span>
            )}
            {error && <span role="alert" className="text-[11px] text-[#b91c1c]">{error}</span>}
          </label>
        </div>
      )}
    </div>
  );
}
