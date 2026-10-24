"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import type { MinEAObject } from "@minea/types";
import { PersonPicker, type PersonChoice } from "@/components/people/PersonPicker";
import { useResolvePerson } from "@/components/people/usePeople";
import { ContractDrawer } from "@/components/vendors/ContractDrawer";
import { usePeopleContacts, useVendorActions } from "@/components/vendors/useVendorActions";
import { VendorRelationships } from "@/components/vendors/VendorRelationships";
import { DRAFT_CONTRACT_ID, draftContract, renewalInfo, type VendorContract } from "@/lib/contracts";
import { moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { modelItemId, modelItemPath, modelPath } from "@/lib/mvp-paths";
import { idleLicences } from "@/lib/reports/cio-views";
import { TOOL_CATALOG } from "@/lib/setup/match-tools";
import { useTenancy } from "@/lib/tenancy";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { cn } from "@/lib/utils";
import {
  knownVendorSuggestions,
  renewalTag,
  vendorKey,
  vendorProducts,
  vendorSummaries,
  type CatalogTool,
  type VendorBadge,
  type VendorSummary,
} from "@/lib/vendors";

const DAY = 86_400_000;

export function shortMoney(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}K`;
  return moneyLabel(dollars);
}

function monthDay(date: Date, withYear = false): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#eef0f4] px-3 py-2.5">
      <div className="text-[19px] font-semibold text-[#1c2230]">{value}</div>
      <div className="text-[11.5px] text-[#8b90a0]">{label}</div>
    </div>
  );
}

function Badge({ badge }: { badge: VendorBadge }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", badge.kind === "concentration" ? "bg-[#fdecec] text-[#b42318]" : "bg-[#fff4e5] text-[#b54708]")}>
      {badge.label}
    </span>
  );
}

function DaysTag({ days }: { days: number }) {
  const tag = renewalTag(days);
  if (!tag.tone) return null;
  return <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium", tag.tone === "red" ? "bg-[#fdecec] text-[#b42318]" : "bg-[#fff4e5] text-[#b54708]")}>{tag.text}</span>;
}

/** All vendor data for the screens, with contracts split across apps (nothing double counted). */
export function useVendorData() {
  const catalog = useModelCatalog();
  const data = catalog.data;
  return useMemo(() => {
    const rows = data?.rows ?? [];
    const objects = data?.objects ?? [];
    const relationships = data?.relationships ?? [];
    const contracts = data?.contracts ?? [];
    const effective = data?.effective ?? objects;
    const vendors = vendorSummaries({ rows, objects, effective, relationships, contracts });
    const idle = idleLicences(effective as never);
    return { loading: catalog.isPending, rows, objects, relationships, contracts, effective, vendors, idle };
  }, [data, catalog.isPending]);
}

export function VendorsHub({ selectedId }: { selectedId?: string }) {
  const id = selectedId ? modelItemId(selectedId) : "";
  if (id) return <VendorDetail id={id} />;
  return <VendorList />;
}

/* ── List ─────────────────────────────────────────────────────────────────────────────────────── */

function VendorList() {
  const router = useRouter();
  const { basePath } = useTenancy();
  const data = useVendorData();
  const actions = useVendorActions();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const tools = TOOL_CATALOG as CatalogTool[];
  const suggestions = useMemo(() => knownVendorSuggestions(data.rows, data.relationships, tools), [data.rows, data.relationships, tools]);
  const total = data.vendors.reduce((s, v) => s + v.spend, 0);
  const now = Date.now();
  const soonContracts = data.contracts.filter((c) => {
    const info = renewalInfo(c);
    return info && info.days >= 0 && info.days <= 90;
  });
  const covered = new Set(data.contracts.flatMap((c) => c.items.map((i) => i.object_id)));
  const soonSpend =
    soonContracts.reduce((s, c) => s + (c.annual_cost_cents ?? 0) / 100, 0) +
    data.rows.filter((r) => !covered.has(r.id) && r.renewalDate && r.renewalDate.getTime() - now <= 90 * DAY && r.renewalDate.getTime() >= now - DAY).reduce((s, r) => s + (r.annualCostNumber ?? 0), 0);
  const top = data.vendors[0];
  const needle = q.trim().toLowerCase();
  const shown = data.vendors.filter((v) => !needle || v.name.toLowerCase().includes(needle) || v.apps.some((a) => a.name.toLowerCase().includes(needle)));

  const createVendor = async (raw: string) => {
    if (!raw.trim()) return;
    setError("");
    try {
      const party = await actions.ensureVendor(raw);
      setName("");
      setAdding(false);
      router.push(modelItemPath(basePath, "vendors", party.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the vendor");
    }
  };
  const linkAll = async () => {
    setError("");
    try {
      for (const s of suggestions) await actions.link(s.row.object, await actions.ensureVendor(s.vendor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link");
    }
  };

  const suggestLine = suggestions.length > 0 && (
    <p className="text-[12.5px] text-[#6b7289]">
      {suggestions.length} of your apps look like they&apos;re from a known vendor:{" "}
      {suggestions.slice(0, 4).map((s, i) => (
        <span key={s.row.id}>
          {i > 0 && ", "}
          <b className="text-[#4b5163]">{s.row.name} → {s.vendor}</b>
        </span>
      ))}
      {suggestions.length > 4 && ` +${suggestions.length - 4}`}{" "}
      <button type="button" onClick={linkAll} className="font-semibold text-[#5b4ce6]">Link all {suggestions.length}</button>
    </p>
  );

  const addBox = (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void createVendor(name); }}>
      <input autoFocus={adding} aria-label="Vendor name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Microsoft" className="h-8 w-[190px] rounded-md border border-[#e6e8ee] px-2 text-[13px] outline-none focus:border-[#c9c3f7]" />
      <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white"><Plus size={13} /> Vendor</button>
    </form>
  );

  if (!data.loading && data.vendors.length === 0) {
    return (
      <div className="px-6 py-5">
        <h1 className="text-[22px] font-semibold text-[#1c2230]">Vendors & contracts</h1>
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#e1e3ea] px-6 py-10 text-center">
          <p className="text-[14px] font-semibold text-[#1c2230]">No vendors yet</p>
          <p className="text-[12.5px] text-[#6b7289]">Type a vendor here, or set Vendor on any app. We&apos;ll suggest it from {tools.length} known products.</p>
          {addBox}
          {suggestLine}
          {error && <p className="text-[12px] text-[#b42318]">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-[#1c2230]">Vendors & contracts</h1>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors or products" className="h-8 w-[200px] rounded-md border border-[#e6e8ee] px-2 text-[12.5px] outline-none focus:border-[#c9c3f7]" />
          {adding ? addBox : (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white"><Plus size={13} /> Vendor</button>
          )}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Kpi value={shortMoney(total)} label={`Annual spend · ${data.vendors.length} vendors`} />
        <Kpi value={shortMoney(soonSpend)} label={`Renews in 90 days · ${soonContracts.length} contract${soonContracts.length === 1 ? "" : "s"}`} />
        <Kpi value={shortMoney(data.idle.totals.wastedCents / 100)} label={`Idle licences · ${data.idle.totals.idle} seats`} />
        <Kpi value={top && total > 0 ? `${Math.round(top.share * 100)}%` : "—"} label={top && total > 0 ? `Spend with top vendor (${top.name})` : "Spend with top vendor"} />
      </div>
      {suggestLine && <div className="mb-3">{suggestLine}</div>}
      {error && <p className="mb-2 text-[12px] text-[#b42318]">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-[#eef0f4]">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-[#fafafb] text-[10.5px] tracking-[0.08em] text-[#8b90a0]">
              {["VENDOR", "APPS", "ANNUAL SPEND", "SHARE", "NEXT RENEWAL", "IDLE", "RISK"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const go = () => router.push(modelItemPath(basePath, "vendors", v.partyId ?? v.name));
              const names = v.apps.map((a) => a.name);
              return (
                <tr key={v.key} onClick={go} className="cursor-pointer border-t border-[#f3f4f8] hover:bg-[#fafafb]">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-[#1c2230]">{v.name}</div>
                    <div className="text-[12px] text-[#8b90a0]">{names.slice(0, 3).join(", ")}{names.length > 3 ? ` +${names.length - 3}` : ""}{!names.length && "No apps yet"}</div>
                  </td>
                  <td className="px-3 py-2.5">{v.apps.length}</td>
                  <td className="px-3 py-2.5">{v.spend > 0 ? moneyLabel(v.spend) : <span className="text-[#8b90a0]">No cost <button type="button" onClick={(e) => { e.stopPropagation(); go(); }} className="text-[#5b4ce6]">Add</button></span>}</td>
                  <td className="px-3 py-2.5">{v.share > 0 && <div className="h-1.5 rounded-full bg-[#5b4ce6]" style={{ width: `${Math.max(6, Math.round((v.share / (top?.share || 1)) * 100))}px` }} />}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{v.renewal ? <>{monthDay(v.renewal.date, v.renewal.days > 300)}<DaysTag days={v.renewal.days} /></> : <span className="text-[#8b90a0]">No date <button type="button" onClick={(e) => { e.stopPropagation(); go(); }} className="text-[#5b4ce6]">Add</button></span>}</td>
                  <td className="px-3 py-2.5">{v.idleCents > 0 ? shortMoney(v.idleCents / 100) : "—"}</td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{v.badges.length ? v.badges.map((b) => <Badge key={b.kind} badge={b} />) : <span className="text-[#b0b4c0]">—</span>}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-[#8b90a0]">Sorted by spend. Vendors come from contracts, each app&apos;s Vendor field and cost lines. A contract&apos;s cost is split across its apps, so nothing counts twice.</p>
    </div>
  );
}

/* ── Detail ───────────────────────────────────────────────────────────────────────────────────── */

function findVendor(vendors: VendorSummary[], id: string): VendorSummary | undefined {
  return vendors.find((v) => v.partyId === id) ?? vendors.find((v) => v.key === vendorKey(id));
}

function VendorDetail({ id }: { id: string }) {
  const router = useRouter();
  const { basePath } = useTenancy();
  const data = useVendorData();
  const actions = useVendorActions();
  const people = usePeopleContacts();
  const resolvePerson = useResolvePerson();
  const [tab, setTab] = useState<"overview" | "relationships" | "contracts">("overview");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VendorContract | null>(null);
  const creating = useRef(false);
  const [allProducts, setAllProducts] = useState(false);
  const [error, setError] = useState("");
  const vendor = findVendor(data.vendors, id);
  const tools = TOOL_CATALOG as CatalogTool[];
  const products = useMemo(
    () => (vendor ? vendorProducts(vendor.key, tools, data.objects.filter((o) => o.type !== "external_party")) : { inUse: [], other: [], total: 0 }),
    [vendor, tools, data.objects]
  );
  if (!vendor) {
    return <div className="px-6 py-5 text-[13px] text-[#8b90a0]">{data.loading ? "Loading…" : <>Vendor not found. <button type="button" className="text-[#5b4ce6]" onClick={() => router.push(modelPath(basePath, "vendors"))}>All vendors</button></>}</div>;
  }
  const run = async (task: () => Promise<unknown>) => {
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };
  const party = async (): Promise<MinEAObject> => vendor.party ?? actions.ensureVendor(vendor.name);
  const props = (vendor.party?.properties ?? {}) as Record<string, unknown>;
  const setProp = (key: string, value: unknown) => run(async () => actions.saveVendor(await party(), { [key]: value }));
  // Open the drawer at once with a draft; the vendor record (if new) and the contract are created behind it.
  const addContract = async () => {
    if (creating.current) return;
    creating.current = true;
    setError("");
    setDraft(draftContract(vendor.name, vendor.partyId));
    setOpenId(DRAFT_CONTRACT_ID);
    try {
      const p = await party();
      const made = await actions.contract.create({ vendor_id: p.id });
      setOpenId((current) => (current === DRAFT_CONTRACT_ID ? made.id : current));
    } catch (err) {
      setOpenId((current) => (current === DRAFT_CONTRACT_ID ? null : current));
      setError(err instanceof Error ? err.message : "Could not add the contract");
    } finally {
      creating.current = false;
      setDraft(null);
    }
  };
  const addProduct = (tool: CatalogTool) => run(async () => {
    await actions.createApp(tool.name, await party(), { catalog_tool: tool.name, ...(tool.category ? { category: tool.category } : {}) });
  });
  const pickOwner = (choice: PersonChoice) => run(async () => {
    const contactId = await resolvePerson(choice);
    const person = people.find((p) => p.id === contactId);
    await actions.saveVendor(await party(), { owner_contact_id: contactId, owner_name: person?.name ?? ("create" in choice ? choice.create.name : null) });
  });
  const open = openId === DRAFT_CONTRACT_ID ? draft : data.contracts.find((c) => c.id === openId) ?? null;
  const byId = new Map(data.rows.map((r) => [r.id, r]));
  const idleById = new Map(data.idle.rows.map((r) => [r.id, r.idle]));
  const seatsLabel = (row: CatalogRow) => {
    const seats = Number(((row.effective ?? row.object).properties ?? {}).licence_count) || 0;
    return seats ? `${seats.toLocaleString("en-US")} seats` : "";
  };
  const coversLabel = (c: VendorContract) => c.items.map((i) => byId.get(i.object_id)?.name).filter(Boolean).join(", ") || "—";
  const contractsTable = (full: boolean) => (
    <div className="overflow-hidden rounded-xl border border-[#eef0f4]">
      {vendor.contracts.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-[13px] font-semibold text-[#1c2230]">No contracts</p>
          <p className="mx-auto mt-1 max-w-[340px] text-[12.5px] text-[#6b7289]">Add one with its cost and renewal date, and you&apos;ll get a reminder before the notice period.</p>
          <button type="button" onClick={addContract} className="mt-2 text-[12.5px] font-medium text-[#5b4ce6]">+ Add contract</button>
        </div>
      ) : (
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#fafafb] text-[10.5px] tracking-[0.08em] text-[#8b90a0]">
              <th className="px-3 py-2 font-semibold">CONTRACT</th>
              <th className="px-3 py-2 font-semibold">COVERS</th>
              <th className="px-3 py-2 text-right font-semibold">ANNUAL</th>
              <th className="px-3 py-2 font-semibold">RENEWS</th>
              {full && <th className="px-3 py-2 font-semibold">NOTICE</th>}
              {full && <th className="px-3 py-2 font-semibold">OWNER</th>}
            </tr>
          </thead>
          <tbody>
            {vendor.contracts.map((c) => {
              const info = renewalInfo(c);
              return (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-t border-[#f3f4f8] hover:bg-[#fafafb]">
                  <td className="px-3 py-2.5 font-semibold text-[#1c2230]">{c.name}</td>
                  <td className="px-3 py-2.5 text-[#4b5163]">{coversLabel(c)}</td>
                  <td className="px-3 py-2.5 text-right">{c.annual_cost_cents != null ? moneyLabel(c.annual_cost_cents / 100) : "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{info ? <>{monthDay(info.end)}{info.days >= 0 && <DaysTag days={info.days} />}</> : "—"}</td>
                  {full && <td className="px-3 py-2.5">{c.notice_days != null ? `${c.notice_days} days${c.auto_renew ? " · auto-renews" : ""}` : "—"}</td>}
                  {full && <td className="px-3 py-2.5">{people.find((p) => p.id === c.owner_contact_id)?.name ?? "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {vendor.contracts.length > 0 && (
        <button type="button" onClick={addContract} className="block w-full border-t border-[#f3f4f8] px-3 py-2 text-left text-[12px] text-[#8b90a0] hover:bg-[#fafafb]">
          <span className="font-medium text-[#5b4ce6]">+ Add contract</span> name, cost, renewal — pick or create the apps it covers
        </button>
      )}
    </div>
  );
  const nextLabel = vendor.renewal ? monthDay(vendor.renewal.date, vendor.renewal.days > 300) : "—";
  const otherShown = allProducts ? products.other : products.other.slice(0, 5);

  return (
    <div className="px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold tracking-[0.12em] text-[#8b90a0]">
            <button type="button" onClick={() => router.push(modelPath(basePath, "vendors"))} className="hover:text-[#5b4ce6]">VENDORS</button> · VENDOR
          </p>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold text-[#1c2230]">
            {vendor.name}
            {vendor.spend > 0 ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", vendor.share > 0.3 ? "bg-[#fdecec] text-[#b42318]" : "bg-[#f3f4f8] text-[#4b5163]")}>{Math.round(vendor.share * 100)}% of spend</span>
            ) : (
              <span className="rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[11px] font-medium text-[#6b7289]">No spend yet</span>
            )}
            {vendor.badges.filter((b) => b.kind !== "concentration" || vendor.share <= 0.3).map((b) => <Badge key={b.kind} badge={b} />)}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[12.5px] text-[#6b7289]">
            Account manager
            <EditText value={String(props.account_manager ?? "")} placeholder="add" label="Account manager" onSave={(v) => setProp("account_manager", v || null)} />
            · Owner
            <PersonPicker people={people} value={(props.owner_contact_id as string) || null} legacyName={(props.owner_name as string) || null} onPick={pickOwner} label="Vendor owner" placeholder="add" noneLabel="No owner" className="inline-block w-[150px]" />
            ·
            <EditText value={String(props.website ?? "")} placeholder="website" label="Website" onSave={(v) => setProp("website", v || null)} />
          </div>
        </div>
        <button type="button" onClick={addContract} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white"><Plus size={13} /> Contract</button>
      </div>

      <div className="my-4 grid grid-cols-4 gap-3">
        <Kpi value={vendor.spend > 0 ? moneyLabel(vendor.spend) : "—"} label={`Annual spend · ${vendor.apps.length} app${vendor.apps.length === 1 ? "" : "s"}`} />
        <Kpi value={nextLabel} label={vendor.renewal ? `Next renewal · ${vendor.renewal.source}` : "Next renewal"} />
        <Kpi value={vendor.idleCents > 0 ? shortMoney(vendor.idleCents / 100) : "—"} label={vendor.seats ? `Idle · ${vendor.idleSeats} of ${vendor.seats.toLocaleString("en-US")} seats` : "Idle licences"} />
        <Kpi value={String(vendor.critical.length)} label="Business-critical apps" />
      </div>

      <div className="mb-4 flex gap-5 border-b border-[#eef0f4] text-[13px]">
        {([["overview", "Overview"], ["relationships", "Relationships"], ["contracts", `Contracts (${vendor.contracts.length})`]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={cn("-mb-px border-b-2 pb-2", tab === key ? "border-[#5b4ce6] font-medium text-[#1c2230]" : "border-transparent text-[#6b7289]")}>{label}</button>
        ))}
      </div>
      {error && <p className="mb-2 text-[12px] text-[#b42318]">{error}</p>}

      {tab === "overview" && (
        <div className="grid grid-cols-[1.15fr_1fr] gap-6">
          <div>
            <h2 className="mb-2 text-[14px] font-semibold text-[#1c2230]">Contracts</h2>
            {contractsTable(false)}
          </div>
          <div>
            <h2 className="mb-2 text-[14px] font-semibold text-[#1c2230]">Software we use from them · {vendor.apps.length}</h2>
            <div className="flex flex-wrap gap-1.5">
              {vendor.apps.map((app) => (
                <button key={app.id} type="button" onClick={() => router.push(modelItemPath(basePath, "applications", app.id))} className="rounded-md border border-[#e6e8ee] px-2 py-1 text-[12.5px] text-[#1c2230] hover:border-[#c9c6f5]">
                  {app.name}{seatsLabel(app) && <span className="ml-1.5 rounded bg-[#f3f4f8] px-1 text-[10.5px] text-[#6b7289]">{seatsLabel(app)}</span>}
                </button>
              ))}
              {!vendor.apps.length && <span className="text-[12.5px] text-[#8b90a0]">None yet.</span>}
            </div>
            {products.other.length > 0 && (
              <>
                <h2 className="mb-2 mt-5 text-[14px] font-semibold text-[#1c2230]">Other products they sell <span className="font-normal text-[#8b90a0]">from catalog · {products.other.length}</span></h2>
                <div className="flex flex-wrap gap-1.5">
                  {otherShown.map((tool) => (
                    <span key={tool.name} className="rounded-md border border-[#e6e8ee] px-2 py-1 text-[12.5px] text-[#1c2230]">
                      {tool.name} <button type="button" onClick={() => addProduct(tool)} className="ml-1 text-[#5b4ce6]">+ Add</button>
                    </span>
                  ))}
                </div>
                {products.other.length > 5 && (
                  <button type="button" onClick={() => setAllProducts((v) => !v)} className="mt-2 text-[12.5px] text-[#5b4ce6]">{allProducts ? "Show fewer" : `See all ${products.other.length} →`}</button>
                )}
              </>
            )}
            {vendor.overlapsWith.length > 0 && (
              <p className="mt-4 flex items-center gap-1 text-[12px] text-[#6b7289]">
                <AlertTriangle size={12} /> Overlaps: {vendor.overlapsWith.map((o) => `${o.app} ↔ ${o.others.join(", ")}`).join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}
      {tab === "contracts" && contractsTable(true)}
      {tab === "relationships" && (
        <VendorRelationships
          vendor={vendor}
          contracts={vendor.contracts}
          apps={vendor.apps}
          other={products.other}
          idleById={idleById}
          layout={(props.node_layout as Record<string, { x: number; y: number }>) ?? undefined}
          onLayoutSave={vendor.party ? (layout) => void setProp("node_layout", layout) : undefined}
          onAdd={addProduct}
        />
      )}
      {open && <ContractDrawer contract={open} vendor={vendor.party} rows={data.rows} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function EditText({ value, placeholder, label, onSave }: { value: string; placeholder: string; label: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input autoFocus aria-label={label} defaultValue={value} onBlur={(e) => { setEditing(false); if (e.target.value.trim() !== value) onSave(e.target.value.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
        className="h-6 w-[160px] rounded border border-[#c9c3f7] px-1 text-[12.5px] outline-none" />
    );
  }
  return (
    <button type="button" aria-label={label} onClick={() => setEditing(true)} className={cn("inline-flex items-center gap-1 border-b border-dashed border-[#d5d8e0]", value ? "text-[#1c2230]" : "text-[#8b90a0]")}>
      {value || placeholder} <Pencil size={10} className="text-[#b0b4c0]" />
    </button>
  );
}
