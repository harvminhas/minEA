"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { MinEAObject } from "@minea/types";
import { PersonPicker, type PersonChoice } from "@/components/people/PersonPicker";
import { useResolvePerson } from "@/components/people/usePeople";
import { AppPicker } from "@/components/vendors/AppPicker";
import { usePeopleContacts, useVendorActions } from "@/components/vendors/useVendorActions";
import { contractShares, formatDay, isDraftContract, renewalInfo, type VendorContract } from "@/lib/contracts";
import { moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

const field = "w-full border-0 border-b border-[#eef0f4] bg-transparent px-0 py-1 text-[13px] text-[#1c2230] outline-none focus:border-[#5b4ce6]";

export function dollarsToCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function intOrNull(value: string): number | null {
  const n = parseInt(value.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-1">
      <span className="text-[12.5px] text-[#8b90a0]">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** Edit a contract in place: every field saves on blur; apps are picked or created inline. */
export function ContractDrawer({
  contract,
  vendor,
  rows,
  onClose,
}: {
  contract: VendorContract;
  vendor: MinEAObject | null;
  rows: readonly CatalogRow[];
  onClose: () => void;
}) {
  const actions = useVendorActions();
  const people = usePeopleContacts();
  const resolvePerson = useResolvePerson();
  const [error, setError] = useState("");
  const [cost, setCost] = useState(contract.annual_cost_cents != null ? String(contract.annual_cost_cents / 100) : "");
  useEffect(() => setCost(contract.annual_cost_cents != null ? String(contract.annual_cost_cents / 100) : ""), [contract.annual_cost_cents]);
  const run = async (task: () => Promise<unknown>) => {
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };
  const save = (body: Parameters<typeof actions.contract.update>[1]) => run(() => actions.contract.update(contract.id, body));
  const info = renewalInfo(contract);
  const shares = contractShares(contract);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pickOwner = (choice: PersonChoice) => run(async () => actions.contract.update(contract.id, { owner_contact_id: await resolvePerson(choice) }));

  const pending = isDraftContract(contract);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled to <body> and stacked above the fixed top nav (z-50), so the header is never hidden;
  // the header and buttons stay put and only the middle scrolls, at any window height.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/20" onClick={onClose} data-testid="contract-drawer">
      <aside className="flex h-[100dvh] max-h-screen w-full max-w-[460px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Contract" aria-busy={pending}>
        <div className="flex shrink-0 items-start justify-between border-b border-[#f3f4f8] px-6 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-[0.12em] text-[#8b90a0]">CONTRACT{vendor ? ` · ${vendor.name.toUpperCase()}` : ""}</p>
            <input
              aria-label="Contract name"
              disabled={pending}
              defaultValue={contract.name}
              key={contract.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== contract.name && save({ name: e.target.value.trim() })}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-[19px] font-semibold text-[#1c2230] outline-none"
            />
            {pending && <span className="mt-1 inline-block rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[11px] font-medium text-[#6b7289]">Creating…</span>}
            {info && (
              <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", info.urgent ? "bg-[#fdecec] text-[#b42318]" : "bg-[#f3f4f8] text-[#4b5163]")}>
                {info.text}
              </span>
            )}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-[#8b90a0] hover:text-[#1c2230]"><X size={16} /></button>
        </div>

        <fieldset disabled={pending} className="min-h-0 flex-1 overflow-y-auto px-6 py-4 disabled:opacity-60" data-testid="contract-drawer-body">
        <div>
          <Row label="Annual cost">
            <input aria-label="Annual cost" value={cost} placeholder="$0" onChange={(e) => setCost(e.target.value)} onBlur={() => {
              const cents = dollarsToCents(cost);
              if (cents !== contract.annual_cost_cents) save({ annual_cost_cents: cents });
            }} className={field} />
          </Row>
          <Row label="Term">
            <div className="flex items-center gap-2">
              <input type="date" aria-label="Start date" defaultValue={contract.start_date ?? ""} key={`s${contract.start_date}`} onBlur={(e) => (e.target.value || null) !== contract.start_date && save({ start_date: e.target.value || null })} className={field} />
              <span className="text-[#8b90a0]">→</span>
              <input type="date" aria-label="End date" defaultValue={contract.end_date ?? ""} key={`e${contract.end_date}`} onBlur={(e) => (e.target.value || null) !== contract.end_date && save({ end_date: e.target.value || null })} className={field} />
            </div>
          </Row>
          <Row label="Notice period">
            <div className="flex items-center gap-1">
              <input aria-label="Notice days" defaultValue={contract.notice_days ?? ""} key={`n${contract.notice_days}`} placeholder="—" onBlur={(e) => intOrNull(e.target.value) !== contract.notice_days && save({ notice_days: intOrNull(e.target.value) })} className={cn(field, "w-16")} />
              <span className="text-[12.5px] text-[#8b90a0]">days{info?.noticeBy ? ` · by ${formatDay(info.noticeBy)}` : ""}</span>
            </div>
          </Row>
          <Row label="Auto-renews">
            <button type="button" aria-label="Auto-renews" onClick={() => save({ auto_renew: !contract.auto_renew })} className="text-[13px] text-[#1c2230] underline decoration-dotted underline-offset-4">
              {contract.auto_renew ? "Yes" : "No"}
            </button>
          </Row>
          <Row label="Owner">
            <PersonPicker people={people} value={contract.owner_contact_id} onPick={pickOwner} label="Contract owner" placeholder="Pick or add a person…" noneLabel="No owner" />
          </Row>
          <Row label="Document">
            <div className="flex items-center gap-2">
              <input aria-label="Document link" defaultValue={contract.document_url ?? ""} key={`d${contract.document_url}`} placeholder="+ Paste a link" onBlur={(e) => (e.target.value.trim() || null) !== contract.document_url && save({ document_url: e.target.value.trim() || null })} className={field} />
              {contract.document_url && <a href={contract.document_url} target="_blank" rel="noreferrer" className="text-[12px] text-[#5b4ce6]">Open</a>}
            </div>
          </Row>
        </div>

        <h3 className="mt-5 text-[14px] font-semibold text-[#1c2230]">Covers</h3>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="bg-[#fafafb] text-[10.5px] tracking-[0.08em] text-[#8b90a0]">
              <th className="px-2 py-2 text-left font-semibold">APP</th>
              <th className="px-2 py-2 text-right font-semibold">SEATS</th>
              <th className="px-2 py-2 text-right font-semibold">IN USE</th>
              <th className="px-2 py-2 text-right font-semibold">IDLE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {contract.items.map((item) => {
              const row = byId.get(item.object_id);
              const idle = item.seats != null && item.in_use != null ? Math.max(0, item.seats - item.in_use) : null;
              const share = shares.get(item.object_id) ?? 0;
              const idleCents = idle != null && item.seats ? Math.round((share / item.seats) * idle) : 0;
              return (
                <tr key={item.object_id} className="border-b border-[#f3f4f8]">
                  <td className="px-2 py-2 text-[#1c2230]">{row?.name ?? "Removed app"}</td>
                  <td className="px-2 py-1 text-right">
                    <input aria-label={`Seats for ${row?.name}`} defaultValue={item.seats ?? ""} key={`seat${item.seats}`} placeholder="—" onBlur={(e) => intOrNull(e.target.value) !== item.seats && run(() => actions.contract.setItem(contract.id, item.object_id, { seats: intOrNull(e.target.value) }))} className="w-16 bg-transparent text-right outline-none" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input aria-label={`In use for ${row?.name}`} defaultValue={item.in_use ?? ""} key={`use${item.in_use}`} placeholder="—" onBlur={(e) => intOrNull(e.target.value) !== item.in_use && run(() => actions.contract.setItem(contract.id, item.object_id, { in_use: intOrNull(e.target.value) }))} className="w-16 bg-transparent text-right outline-none" />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {idle == null ? "—" : idle > 0 && idleCents > 0 ? (
                      <span className="rounded-full bg-[#fff4e5] px-1.5 py-0.5 text-[11px] text-[#b54708]">{idle} · {moneyLabel(idleCents / 100)}</span>
                    ) : idle}
                  </td>
                  <td className="pl-1 text-right">
                    <button type="button" aria-label={`Remove ${row?.name}`} onClick={() => run(() => actions.contract.removeItem(contract.id, item.object_id))} className="text-[#b0b4c0] hover:text-[#b42318]"><X size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2">
          <AppPicker
            rows={rows}
            excludeIds={contract.items.map((item) => item.object_id)}
            onPick={(row) => run(() => actions.contract.setItem(contract.id, row.id, {}))}
            onCreate={(name) => run(async () => {
              const app = await actions.createApp(name, vendor);
              await actions.contract.setItem(contract.id, app.id, {});
            })}
          />
        </div>
        <p className="mt-4 text-[12px] text-[#8b90a0]">Cost here is split across the apps it covers, so app costs and vendor spend stay in step.</p>
        </fieldset>
        <div className="shrink-0 border-t border-[#f3f4f8] px-6 py-3">
          {error && <p className="mb-2 text-[12px] text-[#b42318]">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[12.5px] font-semibold text-white">Done</button>
            <button type="button" disabled={pending} onClick={() => window.confirm(`Delete ${contract.name}?`) && run(async () => { await actions.contract.remove(contract); onClose(); })} className="rounded-md border border-[#e6e8ee] px-3 py-1.5 text-[12.5px] text-[#4b5163] disabled:opacity-50">Delete contract</button>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}
