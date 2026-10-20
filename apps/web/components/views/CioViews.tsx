"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, KeyRound, Layers } from "lucide-react";
import { BackToViews } from "@/components/views/BackToViews";
import { cameFromViews } from "@/lib/views-hub/routes";
import { useTenancy } from "@/lib/tenancy";
import { modelItemPath, reportsPath, type ModelSection } from "@/lib/mvp-paths";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { centsLabel, idleLicences, overlaps } from "@/lib/reports/cio-views";

const SECTION: Record<string, ModelSection> = {
  application: "applications",
  solution: "applications",
  technical_capability: "applications",
  cloud_service: "platforms",
};
const th = "px-3 py-2 text-left text-[11.5px] font-medium text-[#6b7289]";
const td = "px-3 py-2.5 text-[13px] text-[#1c2230]";

function Header({ title, sub }: { title: string; sub: string }) {
  const { basePath } = useTenancy();
  const fromViews = cameFromViews(useSearchParams());
  return (
    <>
      {fromViews ? (
        <BackToViews />
      ) : (
        <div className="mb-4 text-[13px] text-[#6b7289]">
          <Link href={reportsPath(basePath)} className="hover:text-[#1c2230]">← Reports</Link>
        </div>
      )}
      <h1 className="text-[22px] font-semibold text-[#1c2230]">{title}</h1>
      <p className="mb-4 text-[14px] text-[#6b7289]">{sub}</p>
    </>
  );
}

function Stat({ label, big, sub, tone }: { label: string; big: string; sub: string; tone?: "amber" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "amber" ? "border-[#fde68a] bg-[#fffbeb]" : "border-[#e6e8ee] bg-white"}`}>
      <p className="text-[12px] text-[#6b7289]">{label}</p>
      <p className="mt-1 text-[24px] font-semibold text-[#1c2230]">{big}</p>
      <p className="text-[12px] text-[#6b7289]">{sub}</p>
    </div>
  );
}

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const monthly = (cents: number | null) => (cents == null ? "—" : `$${(cents / 1200).toLocaleString("en-US", { maximumFractionDigits: 2 })} /mo`);

export function IdleLicencesReport() {
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const objects = catalog.data?.objects;
  const result = useMemo(() => idleLicences(objects ?? []), [objects]);
  const add = (id: string) => modelItemPath(basePath, "applications", id, "licences_in_use");
  const header = <Header title="Idle licences" sub="Licences you pay for that nobody is using. Idle = licences − in use." />;
  if (catalog.isLoading && !catalog.data) return <div className="px-8 py-6">{header}<p className="text-[13px] text-[#8b90a0]">Loading…</p></div>;

  if (!result.rows.length) {
    return (
      <div className="px-8 py-6" data-testid="idle-licences">
        {header}
        <div className="rounded-2xl border border-dashed border-[#d6d9e2] bg-white p-8 text-center" data-testid="idle-empty">
          <KeyRound className="mx-auto text-[#5b4ce6]" size={22} />
          <p className="mt-3 text-[15px] font-semibold text-[#1c2230]">Add how many licences are in use</p>
          <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-[#6b7289]">
            {result.missing.length
              ? `${result.missing.length} app${result.missing.length === 1 ? " has" : "s have"} a licence count but no in-use count. Add it and we'll show what's idle and what it costs.`
              : "No apps have a licence count yet. Add Licences and In use on an app's Cost section."}
          </p>
          {result.missing.length > 0 && (
            <div className="mx-auto mt-5 max-w-[520px] divide-y divide-[#f3f4f8] rounded-xl border border-[#e6e8ee] text-left">
              {result.missing.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="flex-1 truncate text-[#1c2230]">{item.name}</span>
                  <span className="text-[#6b7289]">{item.bought.toLocaleString("en-US")} licences</span>
                  <Link href={add(item.id)} className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-[12px] font-medium text-[#b45309]">+ Add in use</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const soon = result.rows.filter((row) => row.idle > 0 && row.renewal && withinDays(row.renewal, 90));
  return (
    <div className="px-8 py-6" data-testid="idle-licences">
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="amber" label="Wasted per year" big={centsLabel(result.totals.wastedCents)} sub="idle licences × cost per licence" />
        <Stat label="Idle licences" big={result.totals.idle.toLocaleString("en-US")} sub={`of ${result.totals.bought.toLocaleString("en-US")} counted`} />
        <Stat label="Renewing in 90 days" big={String(soon.length)} sub={soon.length ? `${soon.slice(0, 2).map((row) => row.name).join(", ")}: right-size first` : "with idle licences"} />
        <Stat label="No in-use count" big={String(result.missing.length)} sub={result.missing.length ? "not counted yet" : "every licensed app is counted"} />
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-[#e6e8ee] bg-white">
        <table className="w-full" data-testid="idle-table">
          <thead className="bg-[#fafbfc]"><tr>{["App", "Bought", "In use", "Idle", "Cost / licence", "Wasted / yr", "Owner", "Renewal"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#f3f4f8]">
            {result.rows.map((row) => (
              <tr key={row.id}>
                <td className={`${td} font-medium`}><Link href={modelItemPath(basePath, "applications", row.id)} className="hover:underline">{row.name}</Link></td>
                <td className={td}>{row.bought.toLocaleString("en-US")}</td>
                <td className={td}>{row.inUse.toLocaleString("en-US")}</td>
                <td className={td}>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${row.idle ? "bg-[#fff7ed] text-[#b45309]" : "bg-[#f3f4f8] text-[#4b5163]"}`}>
                    {row.idle ? `${row.idle} · ${Math.round((row.idle / row.bought) * 100)}%` : "0"}
                  </span>
                </td>
                <td className={td}>{monthly(row.perLicenceCents)}</td>
                <td className={`${td} font-semibold`}>{row.wastedCents ? centsLabel(row.wastedCents) : "—"}</td>
                <td className={td}>{row.owner || <span className="text-[#b42318]">Nobody</span>}</td>
                <td className={td}>{dateLabel(row.renewal)}</td>
              </tr>
            ))}
            {result.missing.map((item) => (
              <tr key={item.id} className="text-[#8b90a0]">
                <td className={`${td} text-[#4b5163]`}>{item.name}</td>
                <td className={td}>{item.bought.toLocaleString("en-US")}</td>
                <td className={td}><Link href={add(item.id)} data-testid="add-in-use" className="rounded-md bg-[#fff7ed] px-1.5 py-0.5 text-[12px] font-medium text-[#b45309]">+ Add</Link></td>
                <td className={td} colSpan={5} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-[#8b90a0]">Cost per licence is the per-user price, otherwise annual cost ÷ licences. In-use counts are entered on each app.</p>
    </div>
  );
}

function withinDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(date)) return false;
  const now = Date.now();
  return date >= now - 86_400_000 && date <= now + days * 86_400_000;
}

export function OverlapsReport() {
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const objects = catalog.data?.objects;
  const relationships = catalog.data?.relationships;
  const result = useMemo(() => overlaps(objects ?? [], relationships ?? []), [objects, relationships]);
  const [hints, setHints] = useState(false);
  const header = <Header title="Overlapping tools" sub="Capabilities served by two or more apps or platforms." />;
  const link = (id: string, type: string) => (SECTION[type] ? modelItemPath(basePath, SECTION[type]!, id) : null);
  if (catalog.isLoading && !catalog.data) return <div className="px-8 py-6">{header}<p className="text-[13px] text-[#8b90a0]">Loading…</p></div>;

  return (
    <div className="px-8 py-6" data-testid="overlaps">
      {header}
      {result.groups.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat tone="amber" label="Possible savings" big={result.savingsCents ? `Up to ${centsLabel(result.savingsCents)} / yr` : "—"} sub="if each job kept its most-used tool" />
            <Stat label="Overlaps" big={String(result.groups.length)} sub="capabilities with 2+ tools" />
          </div>
          <div className="mt-5 space-y-3">
            {result.groups.map((group) => (
              <div key={group.id} className="overflow-hidden rounded-xl border border-[#e6e8ee] bg-white" data-testid="overlap-group">
                <div className="flex items-center gap-2 border-b border-[#f3f4f8] px-4 py-2.5">
                  <Layers size={14} className="text-[#5b4ce6]" />
                  <span className="text-[14px] font-semibold text-[#1c2230]">{group.name}</span>
                  <span className="text-[12px] text-[#6b7289]">{group.tools.length} tools</span>
                  <span className="ml-auto text-[12px] text-[#6b7289]">
                    {group.savingsCents ? <>Up to <b className="text-[#1c2230]">{centsLabel(group.savingsCents)}</b> / yr</> : "Add costs to estimate"}
                  </span>
                </div>
                <table className="w-full table-fixed">
                  <thead><tr>{["Tool", "Annual cost", "Owner", "Users", "Renewal", ""].map((h, i) => <th key={i} className={`${th} ${i === 0 ? "w-[34%]" : ""}`}>{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-[#f3f4f8]">
                    {group.tools.map((tool, index) => {
                      const href = link(tool.id, tool.type);
                      return (
                        <tr key={tool.id}>
                          <td className={td}>{href ? <Link href={href} className="hover:underline">{tool.name}</Link> : tool.name}</td>
                          <td className={td}>{centsLabel(tool.annualCents)}</td>
                          <td className={td}>{tool.owner || <span className="text-[#b42318]">Nobody</span>}</td>
                          <td className={td}>{tool.users == null ? "—" : tool.users.toLocaleString("en-US")}</td>
                          <td className={td}>{dateLabel(tool.renewal)}</td>
                          <td className={`${td} text-right`}>{index === 0 && tool.users != null ? <span className="rounded bg-[#f3f4f8] px-1.5 py-0.5 text-[11px] font-medium text-[#4b5163]">Most used</span> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[#8b90a0]">“Up to” keeps the most-used tool per capability and adds up the others' cost. Users = licences in use, else licences.</p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#d6d9e2] bg-white p-8 text-center" data-testid="overlaps-empty">
          <Layers className="mx-auto text-[#5b4ce6]" size={22} />
          <p className="mt-3 text-[15px] font-semibold text-[#1c2230]">No overlaps found</p>
          <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-[#6b7289]">Link capabilities to the apps and platforms that provide them to spot two tools doing the same job.</p>
        </div>
      )}
      {result.categoryHints.length > 0 && (
        <div className="mt-5 text-[13px]" data-testid="category-hints">
          <button type="button" aria-expanded={hints} onClick={() => setHints((open) => !open)} className="flex items-center gap-1 text-[#6b7289] hover:text-[#1c2230]">
            <ChevronRight size={14} className={hints ? "rotate-90" : ""} />
            Same category, no capability linked — check ({result.categoryHints.length})
          </button>
          {hints && (
            <ul className="ml-5 mt-2 space-y-1 text-[#4b5163]">
              {result.categoryHints.map((hint) => (
                <li key={hint.category}><span className="font-medium text-[#1c2230]">{hint.category}</span>: {hint.tools.map((tool) => tool.name).join(", ")}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
