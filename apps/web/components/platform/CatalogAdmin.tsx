"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toolCatalogApi, type CatalogEntry, type CatalogMiss } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { refreshLiveCatalog } from "@/lib/catalog/live-catalog";

type Form = { id?: string; name: string; aliases: string; vendor: string; category: string; hosting: string; kind: string; typicalAnnual: string; ssoUsual: boolean };

const EMPTY: Form = { name: "", aliases: "", vendor: "", category: "", hosting: "saas", kind: "app", typicalAnnual: "", ssoUsual: false };
export const HOSTING_OPTIONS = [["saas", "SaaS"], ["paas", "PaaS"], ["own", "Self-hosted"], ["either", "Either / hybrid"], ["desktop", "Desktop"]] as const;
export const KIND_OPTIONS = [["app", "App"], ["platform", "Platform"], ["server", "Server"]] as const;

export function formFromEntry(entry: CatalogEntry): Form {
  return { id: entry.id, name: entry.name, aliases: entry.aliases.join(", "), vendor: entry.vendor, category: entry.category, hosting: entry.hosting, kind: entry.kind, typicalAnnual: entry.typicalAnnual == null ? "" : String(entry.typicalAnnual), ssoUsual: Boolean(entry.ssoUsual) };
}

export function formFromMiss(miss: CatalogMiss): Form {
  const s = miss.suggestion ?? {};
  return { ...EMPTY, name: s.name || miss.name, aliases: s.name && s.name.toLowerCase() !== miss.name.toLowerCase() ? miss.name.toLowerCase() : "", vendor: s.vendor || "", category: s.category || "", hosting: s.hosting || "saas", kind: s.kind || "app" };
}

export function bodyFromForm(form: Form) {
  return { name: form.name.trim(), aliases: form.aliases.split(",").map((item) => item.trim()).filter(Boolean), vendor: form.vendor.trim(), category: form.category.trim(), hosting: form.hosting as CatalogEntry["hosting"], kind: form.kind as CatalogEntry["kind"], typicalAnnual: form.typicalAnnual.trim() === "" ? null : Number(form.typicalAnnual), ssoUsual: form.ssoUsual };
}

export function CatalogAdmin() {
  const { getToken } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [misses, setMisses] = useState<CatalogMiss[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const token = async () => {
    const value = await getToken();
    if (!value) throw new Error("Not signed in");
    return value;
  };

  useEffect(() => {
    void (async () => {
      try {
        setAllowed((await toolCatalogApi.me(await token())).platformAdmin);
      } catch {
        setAllowed(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (query = q) => {
    const t = await token();
    const [list, missed] = await Promise.all([toolCatalogApi.list(query, t), toolCatalogApi.misses(t)]);
    setEntries(list.entries);
    setTotal(list.total);
    setMisses(missed.misses);
  };

  useEffect(() => {
    if (!allowed) return;
    const timer = window.setTimeout(() => void load(q).catch((err) => setError(err instanceof Error ? err.message : "Could not load")), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, allowed]);

  const afterWrite = async (message: string) => {
    setNotice(message);
    setForm(null);
    await load();
    const t = await token();
    await refreshLiveCatalog(() => toolCatalogApi.tools(t), true);
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const t = await token();
      const body = bodyFromForm(form);
      if (form.id) await toolCatalogApi.update(form.id, body, t);
      else await toolCatalogApi.create(body, t);
      await afterWrite(`${body.name} saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: CatalogEntry) => {
    if (!window.confirm(`Delete ${entry.name} from the catalogue? Existing apps in workspaces are not changed.`)) return;
    setBusy(true);
    try {
      await toolCatalogApi.remove(entry.id, await token());
      await afterWrite(`${entry.name} deleted`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (miss: CatalogMiss) => {
    await toolCatalogApi.dismissMiss(miss.key, await token());
    setMisses((current) => current.filter((item) => item.key !== miss.key));
  };

  if (allowed === null) return <main className="mx-auto max-w-5xl p-8 text-[14px] text-[#6b7289]">Loading…</main>;
  if (!allowed) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <h1 className="text-[22px] font-semibold text-[#1c2230]">App catalogue</h1>
        <p className="mt-2 text-[14px] text-[#6b7289]">Only BuboMap platform admins can edit the app catalogue.</p>
        <Link href="/home" className="mt-4 inline-block text-[14px] font-medium text-[#5b4ce6]">Back to BuboMap</Link>
      </main>
    );
  }

  const field = (key: keyof Form, label: string, props: Record<string, unknown> = {}) => (
    <label className="block text-[12px] text-[#6b7289]">
      {label}
      <input
        value={String(form?.[key] ?? "")}
        onChange={(event) => setForm((current) => current && { ...current, [key]: event.target.value })}
        className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2 py-1.5 text-[13px] text-[#1c2230] outline-none focus:border-[#5b4ce6]"
        {...props}
      />
    </label>
  );

  return (
    <main className="mx-auto max-w-6xl p-6" data-testid="catalog-admin">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">App catalogue</h1>
          <p className="text-[13px] text-[#6b7289]">{total} entries. These fill in vendor, category and hosting when anyone types an app name. Platform admins only.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/home" className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Back</Link>
          <button type="button" onClick={() => { setForm({ ...EMPTY }); setError(""); }} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">Add entry</button>
        </div>
      </div>
      {notice && <p className="mt-3 rounded-lg bg-[#ecfdf5] px-3 py-2 text-[13px] text-[#047857]">{notice}</p>}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, alias, vendor or category" aria-label="Search the catalogue" className="w-full rounded-xl border border-[#e6e8ee] px-3 py-2 text-[14px] outline-none focus:border-[#5b4ce6]" />
          {form && (
            <div className="mt-3 rounded-2xl border border-[#c9c3ff] bg-[#faf9ff] p-4" data-testid="catalog-form">
              <p className="text-[14px] font-semibold text-[#1c2230]">{form.id ? `Edit ${form.name}` : "New entry"}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {field("name", "Name")}
                {field("vendor", "Vendor")}
                {field("aliases", "Aliases (comma separated, include misspellings)")}
                {field("category", "Category")}
                <label className="block text-[12px] text-[#6b7289]">Hosting
                  <select value={form.hosting} onChange={(event) => setForm({ ...form, hosting: event.target.value })} className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2 py-1.5 text-[13px] text-[#1c2230]">
                    {HOSTING_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="block text-[12px] text-[#6b7289]">Kind
                  <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2 py-1.5 text-[13px] text-[#1c2230]">
                    {KIND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {field("typicalAnnual", "Typical annual cost, USD (optional: only a public list-price estimate)", { inputMode: "numeric", placeholder: "Leave empty if unknown" })}
                <label className="mt-5 flex items-center gap-2 text-[13px] text-[#1c2230]">
                  <input type="checkbox" checked={form.ssoUsual} onChange={(event) => setForm({ ...form, ssoUsual: event.target.checked })} />
                  Usually set up with single sign-on
                </label>
              </div>
              {error && <p className="mt-2 text-[13px] text-[#b91c1c]" role="alert">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy || !form.name.trim()} onClick={() => void save()} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setForm(null)} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Cancel</button>
              </div>
            </div>
          )}
          <table className="mt-3 w-full table-fixed text-left text-[13px]">
            <thead className="text-[12px] text-[#8b90a0]">
              <tr><th className="w-[26%] py-1">Name</th><th className="w-[26%]">Aliases</th><th>Vendor</th><th>Category</th><th className="w-[9%]">Hosting</th><th className="w-[8%] text-right">Typical</th><th className="w-[110px]" /></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-[#eef0f4] align-top">
                  <td className="truncate py-1.5 font-medium text-[#1c2230]" title={entry.name}>{entry.name}{entry.kind !== "app" && <span className="ml-1 text-[11px] text-[#6b7289]">({entry.kind})</span>}</td>
                  <td className="truncate text-[#6b7289]" title={entry.aliases.join(", ")}>{entry.aliases.join(", ")}</td>
                  <td className="truncate">{entry.vendor}</td>
                  <td className="truncate">{entry.category}</td>
                  <td>{entry.hosting}</td>
                  <td className="text-right">{entry.typicalAnnual == null ? "—" : `$${entry.typicalAnnual.toLocaleString("en-US")}`}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => { setForm(formFromEntry(entry)); setError(""); }} className="text-[#3f35b5]">Edit</button>
                    <button type="button" disabled={busy} onClick={() => void remove(entry)} className="ml-3 text-[#b91c1c]">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <p className="mt-3 text-[13px] text-[#6b7289]">No entries match.</p>}
        </section>
        <aside data-testid="catalog-misses">
          <h2 className="text-[15px] font-semibold text-[#1c2230]">Most-typed names we didn&apos;t know</h2>
          <p className="mt-1 text-[12px] text-[#6b7289]">From all workspaces (names only). AI suggestions are prefilled; check them before adding.</p>
          <ul className="mt-2 space-y-2">
            {misses.map((miss) => (
              <li key={miss.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[#1c2230]">{miss.name}</span>
                  <span className="shrink-0 text-[12px] text-[#6b7289]">{miss.count}×</span>
                </div>
                {miss.suggestion?.name && <p className="truncate text-[12px] text-[#6b7289]">Suggested: {[miss.suggestion.name, miss.suggestion.vendor, miss.suggestion.category].filter(Boolean).join(" · ")}</p>}
                <div className="mt-1 flex gap-3 text-[12px]">
                  <button type="button" onClick={() => { setForm(formFromMiss(miss)); setError(""); }} className="font-medium text-[#3f35b5]">Add to catalog</button>
                  <button type="button" onClick={() => void dismiss(miss)} className="text-[#6b7289]">Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
          {misses.length === 0 && <p className="mt-2 text-[13px] text-[#6b7289]">Nothing yet.</p>}
        </aside>
      </div>
    </main>
  );
}
