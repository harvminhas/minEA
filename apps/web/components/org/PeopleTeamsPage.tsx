"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { peopleDirectoryApi, workspacesApi, type DirectoryKind, type DirectoryRow, type PeopleDirectory } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";

const TABS: { kind: DirectoryKind; label: string; key: keyof Pick<PeopleDirectory, "teams" | "people" | "roles"> }[] = [
  { kind: "team", label: "Teams", key: "teams" },
  { kind: "person", label: "People", key: "people" },
];

/** Attribute fields per kind (name is edited inline on every kind). */
export const DIRECTORY_FIELDS: Record<DirectoryKind, { key: keyof DirectoryRow; label: string; needsExtras?: boolean }[]> = {
  team: [{ key: "description", label: "Notes" }, { key: "lead_name", label: "Lead" }, { key: "lead_email", label: "Lead email" }],
  person: [{ key: "email", label: "Email" }, { key: "phone", label: "Phone", needsExtras: true }, { key: "title", label: "Title", needsExtras: true }, { key: "notes", label: "Notes", needsExtras: true }],
  role: [{ key: "description", label: "Description" }],
};

export function filterRows(rows: DirectoryRow[], q: string): DirectoryRow[] {
  const key = q.trim().toLowerCase();
  if (!key) return rows;
  return rows.filter((row) => [row.name, row.email, row.title, row.team_name, row.description].some((value) => (value ?? "").toLowerCase().includes(key)));
}

export function deleteWarning(row: DirectoryRow, kind: DirectoryKind): string {
  const what = kind === "team" ? "team" : kind === "person" ? "person" : "role";
  if (!row.usage) return `Delete ${row.name}? Nothing uses this ${what}.`;
  return `Delete ${row.name}? It's used ${row.usage} time${row.usage === 1 ? "" : "s"}. Those records keep the name shown but lose the link to this ${what}.`;
}

export function PeopleTeamsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { isOrgAdmin } = usePermissions();
  const [workspace, setWorkspace] = useState("");
  const [tab, setTab] = useState<DirectoryKind>("team");
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<DirectoryRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const workspaces = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => workspacesApi.list(orgSlug, (await getToken())!),
  });
  useEffect(() => {
    if (!workspace && workspaces.data?.length) setWorkspace(workspaces.data[0]!.slug);
  }, [workspace, workspaces.data]);

  const directory = useQuery({
    queryKey: ["people-directory", orgSlug, workspace],
    enabled: Boolean(workspace) && isOrgAdmin,
    queryFn: async () => peopleDirectoryApi.get(orgSlug, workspace, (await getToken())!),
  });
  const active = TABS.find((item) => item.kind === tab)!;
  const rows = useMemo(() => filterRows(directory.data?.[active.key] ?? [], q), [directory.data, active.key, q]);
  const dupes = directory.data?.duplicates[tab] ?? [];

  const act = async (label: string, task: (token: string) => Promise<unknown>) => {
    setError("");
    try {
      await task((await getToken())!);
      setMessage(label);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["people-directory", orgSlug, workspace] });
      void queryClient.invalidateQueries({ queryKey: ["teams", orgSlug, workspace] });
      void queryClient.invalidateQueries({ queryKey: ["people-contacts", orgSlug, workspace] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (!isOrgAdmin) {
    return <main className="mx-auto max-w-3xl p-8 text-[14px] text-[#6b7289]" data-testid="people-not-admin">Only org owners and admins can manage people &amp; teams.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl p-6" data-testid="people-teams">
      <Link href={`/orgs/${orgSlug}/settings`} className="text-[13px] text-[#5b4ce6]">← Org settings</Link>
      <h1 className="mt-2 text-[22px] font-semibold text-[#1c2230]">People &amp; teams</h1>
      <p className="mt-1 text-[13px] text-[#6b7289]">Teams and people who own your apps. They belong to a workspace, so pick one. Names that differ only in case or spaces are reused, never duplicated.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-[13px] text-[#6b7289]">Workspace{" "}
          <select aria-label="Workspace" value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSelected([]); }} className="ml-1 rounded-lg border border-[#e6e8ee] px-2 py-1 text-[13px] text-[#1c2230]">
            {(workspaces.data ?? []).map((ws) => <option key={ws.slug} value={ws.slug}>{ws.name}</option>)}
          </select>
        </label>
        <div className="flex gap-1" role="tablist">
          {TABS.map((item) => (
            <button key={item.kind} role="tab" aria-selected={tab === item.kind} type="button" onClick={() => { setTab(item.kind); setSelected([]); setEditing(null); }} className={`rounded-full px-3 py-1 text-[13px] ${tab === item.kind ? "bg-[#ece9ff] text-[#3f35b5]" : "text-[#6b7289]"}`}>
              {item.label} <span className="text-[11px]">{directory.data?.[item.key].length ?? ""}</span>
            </button>
          ))}
        </div>
      </div>
      {message && <p className="mt-3 rounded-lg bg-[#ecfdf5] px-3 py-2 text-[13px] text-[#047857]">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]" role="alert">{error}</p>}
      {dupes.length > 0 && (
        <div className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]" data-testid="duplicate-hint">
          {dupes.length} possible duplicate{dupes.length === 1 ? "" : "s"}:{" "}
          {dupes.map((ids) => {
            const names = ids.map((id) => (directory.data?.[active.key] ?? []).find((row) => row.id === id)?.name).filter(Boolean);
            return <button key={ids.join()} type="button" className="mr-2 underline" onClick={() => setSelected(ids)}>{names.join(" / ")}</button>;
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search" aria-label="Search people and teams" className="h-9 flex-1 rounded-lg border border-[#e6e8ee] px-3 text-[13px]" />
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const name = newName.trim(); if (name) void act(`${name} added`, (token) => peopleDirectoryApi.add(orgSlug, workspace, tab, { name }, token)).then(() => setNewName("")); }}>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={`New ${tab === "team" ? "team" : tab === "person" ? "person" : "role"}`} aria-label="New name" className="h-9 rounded-lg border border-[#e6e8ee] px-3 text-[13px]" />
          <button type="submit" className="rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white">Add</button>
        </form>
      </div>
      {selected.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#c9c3ff] bg-[#faf9ff] px-3 py-2 text-[13px]" data-testid="merge-bar">
          Merge {selected.length} into:
          {selected.map((id) => {
            const row = (directory.data?.[active.key] ?? []).find((item) => item.id === id);
            return row ? <button key={id} type="button" className="rounded-full border border-[#5b4ce6] px-2 py-0.5 text-[#3f35b5]" onClick={() => void act(`Merged into ${row.name}`, (token) => peopleDirectoryApi.merge(orgSlug, workspace, tab, id, selected.filter((other) => other !== id), token))}>{row.name}</button> : null;
          })}
          <button type="button" className="text-[#6b7289]" onClick={() => setSelected([])}>Cancel</button>
        </div>
      )}
      <table className="mt-3 w-full text-left text-[13px]">
        <thead className="text-[12px] text-[#8b90a0]">
          <tr><th className="w-8" /><th className="py-1">Name</th>{DIRECTORY_FIELDS[tab].slice(0, 2).map((field) => <th key={field.key}>{field.label}</th>)}{tab === "person" && <th>Team</th>}<th className="text-right">Used by</th><th className="w-[120px]" /></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#eef0f4]">
              <td><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))} /></td>
              <td className="py-1.5 font-medium text-[#1c2230]">{row.name}{tab === "role" && row.role_kind ? <span className="ml-1 text-[11px] text-[#6b7289]">{row.role_kind}</span> : null}</td>
              {DIRECTORY_FIELDS[tab].slice(0, 2).map((field) => <td key={field.key} className="text-[#4b5163]">{(row[field.key] as string) || "—"}</td>)}
              {tab === "person" && <td className="text-[#4b5163]">{row.team_name || "—"}</td>}
              <td className="text-right">{row.usage}</td>
              <td className="text-right">
                <button type="button" className="text-[#3f35b5]" onClick={() => setEditing(row)}>Edit</button>
                <button type="button" className="ml-3 text-[#b91c1c]" onClick={() => { if (window.confirm(deleteWarning(row, tab))) void act(`${row.name} deleted`, (token) => peopleDirectoryApi.remove(orgSlug, workspace, tab, row.id, token)); }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-3 text-[13px] text-[#6b7289]">{directory.isLoading ? "Loading…" : "Nothing here yet."}</p>}
      {editing && (
        <EditDialog
          row={editing}
          kind={tab}
          extras={directory.data?.contactExtras ?? false}
          onCancel={() => setEditing(null)}
          onSave={(body) => void act(`${body.name ?? editing.name} saved`, (token) => peopleDirectoryApi.edit(orgSlug, workspace, tab, editing.id, body, token)).then(() => setEditing(null))}
        />
      )}
    </main>
  );
}

function EditDialog({ row, kind, extras, onCancel, onSave }: { row: DirectoryRow; kind: DirectoryKind; extras: boolean; onCancel: () => void; onSave: (body: Record<string, string>) => void }) {
  const fields = DIRECTORY_FIELDS[kind].filter((field) => extras || !field.needsExtras);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([["name", row.name], ...fields.map((field) => [field.key, String(row[field.key] ?? "")])]));
  return (
    <div className="mt-4 rounded-2xl border border-[#c9c3ff] bg-[#faf9ff] p-4" data-testid="people-edit">
      <p className="text-[14px] font-semibold text-[#1c2230]">Edit {row.name}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {[{ key: "name", label: "Name" }, ...fields].map((field) => (
          <label key={field.key} className="block text-[12px] text-[#6b7289]">{field.label}
            <input value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2 py-1.5 text-[13px] text-[#1c2230]" />
          </label>
        ))}
      </div>
      {!extras && kind === "person" && <p className="mt-2 text-[12px] text-[#6b7289]">Phone, title and notes appear once migration 050 is applied.</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => onSave(values)}>Save</button>
        <button type="button" className="text-[13px] text-[#6b7289]" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
