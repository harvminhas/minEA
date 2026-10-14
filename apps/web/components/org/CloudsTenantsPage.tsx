"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cloudRegionsApi, cloudsApi, workspacesApi, type CloudRegionRow, type CloudTenantRow } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { catalogQueryKey } from "@/lib/use-model-catalog";
import { PROVIDERS, providerLabel, providerRegions, regionLabel, type CloudProvider, type CustomRegion } from "@/lib/hosting/cloud";

/** Tenants grouped by the fixed provider list, in its order; empty providers are left out. */
export function groupTenants(rows: CloudTenantRow[]): { provider: CloudProvider; label: string; tenants: CloudTenantRow[] }[] {
  return PROVIDERS.map((p) => ({ provider: p.id, label: p.label, tenants: rows.filter((row) => (row.provider || "other") === p.id) })).filter((group) => group.tenants.length > 0);
}

export function tenantDeleteWarning(row: CloudTenantRow): string {
  if (!row.usage) return `Delete ${row.name}? No app runs on it.`;
  return `Delete ${row.name}? ${row.usage} app${row.usage === 1 ? " runs" : "s run"} on it. They lose the link (and its region) and show as “No tenant recorded”.`;
}

export function regionDeleteWarning(row: CloudRegionRow): string {
  if (!row.usage) return `Delete ${row.name}? Nothing uses this region.`;
  return `Delete ${row.name}? It's used by ${row.usage} app link${row.usage === 1 ? "" : "s"}. They keep their tenant and show as “Region not recorded”.`;
}

/** Merging needs two or more tenants of one provider. */
export function mergeProblem(rows: CloudTenantRow[], ids: string[]): string {
  const picked = rows.filter((row) => ids.includes(row.id));
  if (picked.length < 2) return "Pick two or more to merge.";
  return new Set(picked.map((row) => row.provider)).size > 1 ? "Merge tenants of one provider only." : "";
}

export function CloudsTenantsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { isOrgAdmin } = usePermissions();
  const [workspace, setWorkspace] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<CloudTenantRow | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newRegion, setNewRegion] = useState<{ provider: CloudProvider; name: string }>({ provider: "azure", name: "" });

  const workspaces = useQuery({ queryKey: ["workspaces", orgSlug], queryFn: async () => workspacesApi.list(orgSlug, (await getToken())!) });
  useEffect(() => {
    if (!workspace && workspaces.data?.length) setWorkspace(workspaces.data[0]!.slug);
  }, [workspace, workspaces.data]);
  const clouds = useQuery({
    queryKey: ["clouds", orgSlug, workspace],
    enabled: Boolean(workspace) && isOrgAdmin,
    queryFn: async () => cloudsApi.get(orgSlug, workspace, (await getToken())!),
  });
  const tenants = clouds.data?.tenants ?? [];
  const custom: CustomRegion[] = clouds.data?.custom ?? [];
  const groups = useMemo(() => groupTenants(tenants), [tenants]);
  const dupes = clouds.data?.duplicates ?? [];
  const problem = mergeProblem(tenants, selected);

  const act = async (label: string, task: (token: string) => Promise<unknown>) => {
    setError("");
    try {
      await task((await getToken())!);
      setMessage(label);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["clouds", orgSlug, workspace] });
      void queryClient.invalidateQueries({ queryKey: ["cloud-regions", orgSlug, workspace] });
      void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspace) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (!isOrgAdmin) {
    return <main className="mx-auto max-w-3xl p-8 text-[14px] text-[#6b7289]" data-testid="clouds-not-admin">Only org owners and admins can manage clouds &amp; tenants.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl p-6" data-testid="clouds-tenants">
      <Link href={`/orgs/${orgSlug}/settings`} className="text-[13px] text-[#5b4ce6]">← Org settings</Link>
      <h1 className="mt-2 text-[22px] font-semibold text-[#1c2230]">Clouds &amp; tenants</h1>
      <p className="mt-1 text-[13px] text-[#6b7289]">Each tenant, subscription, account or project your apps run on, by provider. Regions belong to the provider and are shared by its tenants; tick the ones a tenant uses to list them first when picking. They belong to a workspace, so pick one.</p>
      <label className="mt-4 inline-block text-[13px] text-[#6b7289]">Workspace{" "}
        <select aria-label="Workspace" value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSelected([]); setEditing(null); }} className="ml-1 rounded-lg border border-[#e6e8ee] px-2 py-1 text-[13px] text-[#1c2230]">
          {(workspaces.data ?? []).map((ws) => <option key={ws.slug} value={ws.slug}>{ws.name}</option>)}
        </select>
      </label>
      {message && <p className="mt-3 rounded-lg bg-[#ecfdf5] px-3 py-2 text-[13px] text-[#047857]">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]" role="alert">{error}</p>}
      {dupes.length > 0 && (
        <div className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]" data-testid="duplicate-hint">
          {dupes.length} possible duplicate{dupes.length === 1 ? "" : "s"}:{" "}
          {dupes.map((ids) => <button key={ids.join()} type="button" className="mr-2 underline" onClick={() => setSelected(ids)}>{ids.map((id) => tenants.find((row) => row.id === id)?.name).join(" / ")}</button>)}
        </div>
      )}
      {selected.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#c9c3ff] bg-[#faf9ff] px-3 py-2 text-[13px]" data-testid="merge-bar">
          {problem ? <span className="text-[#92400e]">{problem}</span> : <>Merge {selected.length} into:</>}
          {!problem && selected.map((id) => {
            const row = tenants.find((item) => item.id === id);
            return row ? <button key={id} type="button" className="rounded-full border border-[#5b4ce6] px-2 py-0.5 text-[#3f35b5]" onClick={() => void act(`Merged into ${row.name}`, (token) => cloudsApi.mergeTenants(orgSlug, workspace, id, selected.filter((other) => other !== id), token))}>{row.name}</button> : null;
          })}
          <button type="button" className="text-[#6b7289]" onClick={() => setSelected([])}>Cancel</button>
        </div>
      )}

      <section className="mt-5" data-testid="tenants-section">
        <h2 className="text-[15px] font-semibold text-[#1c2230]">Tenants &amp; accounts</h2>
        {groups.length === 0 && <p className="mt-2 text-[13px] text-[#6b7289]">{clouds.isLoading ? "Loading…" : "No tenants yet. Pick “Our cloud” (or a SaaS tenant) on an app to add one."}</p>}
        {groups.map((group) => (
          <div key={group.provider} className="mt-3 rounded-xl border border-[#e6e8ee] bg-white p-3" data-testid="provider-group">
            <p className="text-[13px] font-semibold text-[#1c2230]">{group.label} <span className="text-[11px] font-normal text-[#8b90a0]">{group.tenants.length} tenant{group.tenants.length === 1 ? "" : "s"}</span></p>
            <table className="mt-1 w-full text-left text-[13px]">
              <thead className="text-[12px] text-[#8b90a0]"><tr><th className="w-8" /><th className="py-1">Name</th><th>Tenant / account ID</th><th>Owner</th><th>Cost / yr</th><th>Regions used</th><th className="text-right">Apps</th><th className="w-[120px]" /></tr></thead>
              <tbody>
                {group.tenants.map((row) => (
                  <tr key={row.id} className="border-t border-[#eef0f4]" data-testid="tenant-row">
                    <td><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))} /></td>
                    <td className="py-1.5 font-medium text-[#1c2230]">{row.name}</td>
                    <td className="text-[#4b5163]">{row.tenant_id || "—"}</td>
                    <td className="text-[#4b5163]">{row.owner || "—"}</td>
                    <td className="text-[#4b5163]">{row.annual_cost ? `$${row.annual_cost}` : "—"}</td>
                    <td className="text-[#4b5163]">{row.regions_used.length ? row.regions_used.map((key) => regionLabel(key, custom)).join(", ") : "—"}</td>
                    <td className="text-right">{row.usage}</td>
                    <td className="text-right">
                      <button type="button" className="text-[#3f35b5]" onClick={() => setEditing(row)}>Edit</button>
                      <button type="button" className="ml-3 text-[#b91c1c]" onClick={() => { if (window.confirm(tenantDeleteWarning(row))) void act(`${row.name} deleted`, (token) => cloudsApi.deleteTenant(orgSlug, workspace, row.id, token)); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editing && group.tenants.some((row) => row.id === editing.id) && (
              <TenantEdit
                row={editing}
                custom={custom}
                onCancel={() => setEditing(null)}
                onSave={(body) => void act(`${String(body.name ?? editing.name)} saved`, (token) => cloudsApi.editTenant(orgSlug, workspace, editing.id, body, token)).then(() => setEditing(null))}
              />
            )}
          </div>
        ))}
      </section>

      <section className="mt-6" data-testid="regions-section">
        <h2 className="text-[15px] font-semibold text-[#1c2230]">Custom regions</h2>
        <p className="mt-1 text-[12px] text-[#6b7289]">Built-in regions (Azure, AWS, Google Cloud, Microsoft 365 geos…) are always available. Add a custom one only when a provider&apos;s region isn&apos;t listed; a name that matches a built-in region uses it instead.</p>
        {clouds.data && !clouds.data.available && <p className="mt-2 text-[12px] text-[#92400e]">Custom regions appear once migration 051 is applied.</p>}
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const name = newRegion.name.trim(); if (name) void act(`${name} added`, (token) => cloudRegionsApi.add(orgSlug, workspace, newRegion.provider, name, token)).then(() => setNewRegion((current) => ({ ...current, name: "" }))); }}>
          <select aria-label="Provider" value={newRegion.provider} onChange={(event) => setNewRegion((current) => ({ ...current, provider: event.target.value as CloudProvider }))} className="h-9 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input aria-label="New region name" value={newRegion.name} onChange={(event) => setNewRegion((current) => ({ ...current, name: event.target.value }))} placeholder="Region name" className="h-9 rounded-lg border border-[#e6e8ee] px-3 text-[13px]" />
          <button type="submit" className="rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white">Add region</button>
        </form>
        <table className="mt-3 w-full text-left text-[13px]">
          <thead className="text-[12px] text-[#8b90a0]"><tr><th className="py-1">Provider</th><th>Name</th><th className="text-right">Used by</th><th>Merge into</th><th className="w-[140px]" /></tr></thead>
          <tbody>
            {custom.map((row) => <RegionRow key={row.id} row={row as CloudRegionRow} custom={custom} onRename={(name) => void act(`${name} saved`, (token) => cloudsApi.renameRegion(orgSlug, workspace, row.id, name, token))} onMerge={(key) => void act(`Merged into ${regionLabel(key, custom)}`, (token) => cloudsApi.mergeRegions(orgSlug, workspace, key, [row.id], token))} onDelete={() => { if (window.confirm(regionDeleteWarning(row as CloudRegionRow))) void act(`${row.name} deleted`, (token) => cloudsApi.deleteRegion(orgSlug, workspace, row.id, token)); }} />)}
          </tbody>
        </table>
        {custom.length === 0 && <p className="mt-2 text-[13px] text-[#6b7289]">No custom regions.</p>}
      </section>
    </main>
  );
}

function RegionRow({ row, custom, onRename, onMerge, onDelete }: { row: CloudRegionRow; custom: CustomRegion[]; onRename: (name: string) => void; onMerge: (key: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(row.name);
  const targets = providerRegions(row.provider as CloudProvider, custom).filter((region) => region.key !== row.key);
  return (
    <tr className="border-t border-[#eef0f4]" data-testid="custom-region-row">
      <td className="py-1.5 text-[#4b5163]">{providerLabel(row.provider)}</td>
      <td><input aria-label={`Rename ${row.name}`} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== row.name) onRename(name.trim()); }} className="h-8 rounded-lg border border-[#e6e8ee] px-2 text-[13px]" /></td>
      <td className="text-right">{row.usage}</td>
      <td>
        <select aria-label={`Merge ${row.name} into`} value="" onChange={(event) => { if (event.target.value) onMerge(event.target.value); }} className="h-8 max-w-[220px] rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
          <option value="">—</option>
          {targets.map((region) => <option key={region.key} value={region.key}>{region.name}{region.custom ? " (custom)" : ""}</option>)}
        </select>
      </td>
      <td className="text-right"><button type="button" className="text-[#b91c1c]" onClick={onDelete}>Delete</button></td>
    </tr>
  );
}

function TenantEdit({ row, custom, onCancel, onSave }: { row: CloudTenantRow; custom: CustomRegion[]; onCancel: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [values, setValues] = useState({ name: row.name, provider: (row.provider || "other") as CloudProvider, tenant_id: row.tenant_id, owner: row.owner, annual_cost: row.annual_cost });
  const [used, setUsed] = useState<string[]>(row.regions_used);
  const regions = providerRegions(values.provider, custom);
  const field = (key: "name" | "tenant_id" | "owner" | "annual_cost", label: string) => (
    <label className="block text-[12px] text-[#6b7289]">{label}
      <input value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2 py-1.5 text-[13px] text-[#1c2230]" />
    </label>
  );
  return (
    <div className="mt-3 rounded-2xl border border-[#c9c3ff] bg-[#faf9ff] p-4" data-testid="tenant-edit">
      <p className="text-[14px] font-semibold text-[#1c2230]">Edit {row.name}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {field("name", "Name")}
        <label className="block text-[12px] text-[#6b7289]">Provider
          <select value={values.provider} onChange={(event) => { setValues((current) => ({ ...current, provider: event.target.value as CloudProvider })); setUsed([]); }} className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2 py-1.5 text-[13px] text-[#1c2230]">
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {field("tenant_id", "Tenant / subscription / account / project ID")}
        {field("owner", "Owner")}
        {field("annual_cost", "Cost per year ($)")}
      </div>
      <p className="mt-3 text-[12px] text-[#6b7289]">Regions used (listed first when picking a region for this tenant)</p>
      <div className="mt-1 flex max-h-40 flex-wrap gap-x-3 gap-y-1 overflow-auto text-[12px]" data-testid="regions-used">
        {regions.map((region) => (
          <label key={region.key} className="inline-flex items-center gap-1 text-[#1c2230]">
            <input type="checkbox" checked={used.includes(region.key)} onChange={(event) => setUsed((current) => (event.target.checked ? [...current, region.key] : current.filter((key) => key !== region.key)))} />
            {region.name}{region.custom ? " (custom)" : ""}
          </label>
        ))}
        {regions.length === 0 && <span className="text-[#8b90a0]">No regions for this provider yet. Add a custom one below.</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => onSave({ ...values, regions_used: used })}>Save</button>
        <button type="button" className="text-[13px] text-[#6b7289]" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
