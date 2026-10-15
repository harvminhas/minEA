"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  LOCATION_CHOICES,
  SERVER_SEARCH_AFTER,
  filterServers,
  findServer,
  type LocationChoice,
  type ServerOption,
} from "@/lib/setup/hosting-choice";
import { CloudPicker } from "@/components/hosting/CloudPicker";
import type { PendingTenant } from "@/lib/hosting/pending-tenants";
import { providerForVendor, type CloudProvider, type CustomRegion, type HostingDetail, type TenantOption } from "@/lib/hosting/cloud";

/**
 * Five compact chips (SaaS / Our cloud / Our server / On people's computers / Don't know). "Our server"
 * expands an inline picker: the org's servers (searchable past 6) and "+ New server". "Our cloud"
 * (and, optionally, SaaS) shows provider / tenant / region fields when the caller passes onDetail.
 * Presentational: the caller decides whether a pick is saved now or later.
 */
export function LocationChips({
  value,
  serverName,
  servers,
  onChoose,
  onPickServer,
  disabled,
  firstChipProps,
  detail,
  tenants = [],
  pendingTenants = [],
  custom,
  onAddRegion,
  vendor,
  onDetail,
  suggest,
}: {
  value: LocationChoice;
  serverName?: string;
  servers: ServerOption[];
  onChoose: (choice: LocationChoice) => void;
  /** existing = a record from `servers`; otherwise a new name typed by the person. */
  onPickServer: (name: string, existing?: ServerOption) => void;
  disabled?: boolean;
  firstChipProps?: Record<string, string>;
  detail?: HostingDetail;
  tenants?: TenantOption[];
  /** New tenants typed on other rows of this batch. */
  pendingTenants?: PendingTenant[];
  custom?: CustomRegion[];
  onAddRegion?: (provider: CloudProvider, name: string) => Promise<string>;
  /** Catalogue vendor: the SaaS provider (Microsoft → Microsoft 365). */
  vendor?: string;
  onDetail?: (next: HostingDetail) => void;
  /** A choice to mark as suggested ("We built it ourselves" → Our cloud). */
  suggest?: LocationChoice;
}) {
  const [picking, setPicking] = useState(false);
  const [saasOpen, setSaasOpen] = useState(Boolean(detail?.tenantName || detail?.tenantId || detail?.regionKey));
  return (
    <div data-testid="location-chips">
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap" role="radiogroup" aria-label="Where it runs">
        {LOCATION_CHOICES.map(({ choice, label, hint }) => {
          const on = value === choice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={on}
              title={hint}
              disabled={disabled}
              data-choice={choice}
              {...(choice === "own" ? { "data-where-own": "" } : {})}
              {...(choice === "saas" ? firstChipProps : {})}
              onClick={() => {
                if (choice === "own") setPicking((open) => (value === "own" ? !open : true));
                else setPicking(false);
                onChoose(choice);
              }}
              data-suggested={!on && suggest === choice ? "" : undefined}
              className={`inline-flex min-h-[30px] items-center justify-center gap-1 rounded-xl border px-2.5 py-1 text-center text-[12px] leading-4 sm:justify-start sm:whitespace-nowrap sm:rounded-full transition-colors disabled:opacity-50 ${
                on ? "border-[#5b4ce6] bg-[#ece9ff] font-medium text-[#3f35b5]" : suggest === choice ? "border-dashed border-[#a99cf5] text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163] hover:border-[#c9c6f5]"
              }`}
            >
              {on && <Check size={12} />}
              {choice === "own" && on && serverName ? `Our server · ${serverName}` : label}
            </button>
          );
        })}
      </div>
      {suggest && value !== suggest && value === "unknown" && (
        <p className="mt-1 text-[11px] text-[#6b7289]">Suggested: {LOCATION_CHOICES.find((item) => item.choice === suggest)?.label}</p>
      )}
      {onDetail && detail && value === "own_cloud" && (
        <CloudPicker mode="own_cloud" value={detail} tenants={tenants} pending={pendingTenants} custom={custom} onAddRegion={onAddRegion} onChange={onDetail} disabled={disabled} />
      )}
      {onDetail && detail && value === "saas" && (
        saasOpen ? (
          <CloudPicker mode="saas" value={detail} tenants={tenants} pending={pendingTenants} custom={custom} onAddRegion={onAddRegion} onChange={onDetail} disabled={disabled} />
        ) : (
          <button
            type="button"
            onClick={() => {
              setSaasOpen(true);
              if (!detail.provider) onDetail({ ...detail, provider: providerForVendor(vendor) ?? "other" });
            }}
            className="mt-1 text-[12px] font-medium text-[#5b4ce6]"
          >
            + Tenant &amp; region (optional)
          </button>
        )
      )}
      {value === "own" && picking && (
        <ServerPicker
          servers={servers}
          selected={serverName}
          onPick={(name, existing) => {
            onPickServer(name, existing);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

export function ServerPicker({
  servers,
  selected,
  onPick,
}: {
  servers: ServerOption[];
  selected?: string;
  onPick: (name: string, existing?: ServerOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);
  const searchable = servers.length > SERVER_SEARCH_AFTER;
  const shown = filterServers(servers, searchable ? query : "");
  const submitNew = () => {
    const name = draft.trim();
    if (!name) return;
    onPick(findServer(servers, name)?.name ?? name, findServer(servers, name));
    setDraft("");
    setAdding(false);
  };
  return (
    <div data-testid="server-picker" className="mt-2 w-full max-w-sm rounded-xl border border-[#e6e8ee] bg-white p-1.5 shadow-sm">
      {searchable && (
        <label className="mb-1 flex items-center gap-1.5 rounded-lg border border-[#eef0f4] px-2">
          <Search size={13} className="text-[#8b90a0]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search servers" className="h-7 w-full bg-transparent text-[12px] outline-none" />
        </label>
      )}
      <ul className="max-h-48 overflow-y-auto">
        {shown.map((server) => {
          const on = selected ? findServer([server], selected) !== undefined : false;
          return (
            <li key={server.id ?? server.name}>
              <button
                type="button"
                onClick={() => onPick(server.name, server)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[#f4f3ff] ${on ? "font-medium text-[#3f35b5]" : "text-[#1c2230]"}`}
              >
                <span className="truncate" title={server.name}>{server.name}</span>
                {on && <Check size={13} className="shrink-0" />}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-1.5 text-[12px] text-[#8b90a0]">{servers.length ? "No match" : "No servers yet"}</li>}
      </ul>
      <div className="mt-1 border-t border-[#f1f2f6] pt-1">
        {adding ? (
          <input
            ref={addRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitNew();
              }
              if (event.key === "Escape") setAdding(false);
            }}
            onBlur={() => !draft.trim() && setAdding(false)}
            placeholder="Server name, then Enter"
            aria-label="New server name"
            className="h-8 w-full rounded-lg border border-[#c9c6f5] px-2 text-[13px] outline-none"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-[#5b4ce6] hover:bg-[#f4f3ff]">
            <Plus size={13} /> New server
          </button>
        )}
      </div>
    </div>
  );
}
