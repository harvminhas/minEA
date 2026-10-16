"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, X } from "lucide-react";
import type { AskAnswer } from "@/lib/ask/deterministic";
import { chipOptions, chipValue, factsForIds, FILTER_KEYS, FILTER_LABEL, filterFacts, filterLine, OP_KEYS, OP_LABEL, OPS, opOf, regionName, HOSTING, withFilter, type FilterKey, type FilterOp, type RecordFacts, type RecordFilters } from "@/lib/ask/record-filter";
import { moneyLabel, type CatalogRow } from "@/lib/model-catalog";

/** Filters a person can add from the "+ Add filter" menu (each re-runs locally, no AI). */
const ADDABLE: FilterKey[] = ["vendor", "owner_team", "owner", "hosting", "provider", "tenant", "region", "ai_on", "renewal_within_days", "criticality"];
/** Narrow-it-down follow-ups under a list answer: they add a filter, they don't ask a new question. */
const NARROW: { label: string; add: RecordFilters; when?: (kept: RecordFacts[]) => boolean }[] = [
  { label: "Which have no owner?", add: { owner: "none" }, when: (kept) => kept.some((item) => !hasOwner(item.row)) },
  { label: "Renewing in 90 days?", add: { renewal_within_days: 90 } },
  { label: "Which have AI turned on?", add: { ai_on: true }, when: (kept) => kept.some((item) => item.aiOn) },
];
/** Rows shown before "Show N more". */
export const LEAN_ROWS = 5;

const hasOwner = (row: CatalogRow) => Boolean(row.ownerTeam || row.ownerPerson);

export type LeanSummary = {
  /** "Yes" for a yes/no question, else null. */
  yes: boolean;
  /** Names to lead with (yes/no with 1–3 items). */
  names: CatalogRow[];
  /** "7 Microsoft items", "No items match", or null when names lead. */
  title: string | null;
  costTotal: number;
  kinds: { label: string; count: number }[];
  gaps: string[];
  inferredVendor: boolean;
};

/** Short headline and chips for a filtered list (quick or AI answer), from the rows kept. */
export function leanSummary(kept: RecordFacts[], filters: RecordFilters, yesNo: boolean): LeanSummary {
  const rows = kept.map((item) => item.row);
  const one = rows.length === 1;
  const noOwner = rows.filter((row) => !hasOwner(row)).length;
  const noCost = rows.filter((row) => row.annualCostNumber == null).length;
  const kinds = new Map<string, number>();
  for (const row of rows) kinds.set(row.typeLabel, (kinds.get(row.typeLabel) ?? 0) + 1);
  // No reading of the question here: the AI writes its own headline (records.headline). This is only
  // the neutral count shown for quick answers and after a chip edit.
  const names = yesNo && rows.length > 0 && rows.length <= 3 ? rows : [];
  const noun = rows.length === 1 ? "item" : "items";
  const title = names.length ? null : rows.length ? `${yesNo ? "Yes — " : ""}${rows.length} ${noun}` : yesNo ? "No — nothing matches" : "Nothing matches these filters";
  return {
    yes: yesNo && rows.length > 0,
    names,
    title,
    costTotal: rows.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0),
    kinds: rows.length > 1 ? [...kinds].map(([label, count]) => ({ label: count === 1 ? label : pluralKind(label), count })) : [],
    gaps: [
      ...(noOwner && !filters.owner && opOf(filters, "owner_team") !== "is_empty" ? [one ? "No owner" : `${noOwner} no owner`] : []),
      ...(noCost ? [one ? "No cost" : `${noCost} no cost`] : []),
    ],
    inferredVendor: Boolean(filters.vendor) && kept.some((item) => item.vendorInferred),
  };
}

/** "10 Applications · 1 SaaS platform · $15,000/yr recorded · ⚠ 9 no owner · ⚠ 10 no cost · 1 filter". */
export function summaryLine(lean: LeanSummary, count: number, filterCount: number, extra: string[] = []): { text: string; warn?: boolean }[] {
  const parts: { text: string; warn?: boolean }[] = [];
  if (lean.kinds.length) lean.kinds.forEach((kind) => parts.push({ text: `${kind.count} ${kind.label}` }));
  else if (count) parts.push({ text: `${count} ${count === 1 ? "item" : "items"}` });
  extra.forEach((text) => parts.push({ text }));
  if (lean.costTotal > 0) parts.push({ text: `${moneyLabel(lean.costTotal)}/yr recorded` });
  lean.gaps.forEach((gap) => parts.push({ text: gap, warn: true }));
  if (lean.inferredVendor) parts.push({ text: "vendor from catalogue" });
  if (filterCount) parts.push({ text: `${filterCount} ${filterCount === 1 ? "filter" : "filters"}` });
  return parts;
}

function pluralKind(label: string) {
  if (/saas$/i.test(label)) return label;
  if (/y$/.test(label) && !/[aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
  return /s$/.test(label) ? label : `${label}s`;
}

/** Amber "missing" chip; also used by the short "No" answer. */
export function GapChip({ text }: { text: string }) {
  return <span data-testid="ask-gap-chip" className="inline-flex items-center gap-1 rounded-full border border-[#f6dfbd] bg-[#fff4e5] px-2 py-0.5 text-[12px] text-[#a35a00]"><AlertTriangle size={11} />{text}</span>;
}

export function MetaChip({ text, testId }: { text: string; testId?: string }) {
  return <span data-testid={testId} className="rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[12px] text-[#3c4254]">{text}</span>;
}

/** Footer follow-up pill (max two per answer). */
export function FollowPill({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const cls = "rounded-full border border-[#e6e8ee] bg-white px-2.5 py-0.5 text-[12px] text-[#3c4254] hover:border-[#c9c6f5]";
  return href ? <a href={href} className={cls}>{label}</a> : <button type="button" onClick={onClick} className={cls}>{label}</button>;
}

export function AskRecordsBlock({
  answer,
  facts,
  onFilters,
  onOpen,
  rowHref,
  yesNo,
  footerExtra,
  animate,
  extraSummary,
  defaultDetails,
  prose,
  defaultProse,
}: {
  /** The AI's prose/bullets: folded under "Show summary" (closed by default) so the card leads with the headline. */
  prose?: React.ReactNode;
  defaultProse?: boolean;
  /** Start with Details open (tests, and future "always expanded" preference). */
  defaultDetails?: boolean;
  /** Extra facts for the summary line, e.g. "5 vendors" from a vendor lookup. */
  extraSummary?: string[];
  /** A just-arrived answer: the headline streams in word by word and rows fill in. */
  animate?: boolean;
  answer: AskAnswer;
  /** Lead with Yes/No (asked as "do we use X?"); defaults to the quick answer's own flag. */
  yesNo?: boolean;
  /** Small actions (Save, Export…) shown in the footer. */
  footerExtra?: React.ReactNode;
  facts: RecordFacts[];
  onFilters: (filters: RecordFilters) => void;
  onOpen: (row: CatalogRow) => void;
  rowHref: (row: CatalogRow) => string;
}) {
  const records = answer.records!;
  const filters = records.filters;
  // Context answers name their items (ids); filter answers and chip edits run the filters here.
  const kept = useMemo(() => (records.ids ? factsForIds(records.ids, records.items ?? [], facts) : filterFacts(facts, filters)), [facts, filters, records.ids, records.items]);
  const keys = FILTER_KEYS.filter((key) => filters[key] !== undefined);
  const set = (key: FilterKey, value: unknown, op: FilterOp = opOf(filters, key)) => onFilters(withFilter(filters, key, value, op));
  const setOp = (key: FilterKey, op: FilterOp) => {
    const current = String(filters[key] ?? "");
    const value = op === "is_empty" || op === "is_not_empty" ? "" : current || chipOptions(key, facts)[0]?.value || "";
    onFilters(withFilter(filters, key, value, op));
  };
  const [all, setAll] = useState(false);
  const lean = leanSummary(kept, filters, yesNo ?? Boolean(records.yesNo));
  if (records.headline) {
    lean.title = records.headline; // the AI's own words, shown as written
    lean.names = [];
  }
  const shown = all ? kept : kept.slice(0, LEAN_ROWS);
  const [details, setDetails] = useState(Boolean(defaultDetails));
  const [proseOpen, setProseOpen] = useState(Boolean(defaultProse));
  const summaryParts = summaryLine(lean, kept.length, keys.length, extraSummary);
  const single = kept.length === 1 ? kept[0].row : null;
  const follow: { label: string; onClick?: () => void; href?: string }[] = single
    ? [
        ...(!hasOwner(single) ? [{ label: "Set an owner", href: rowHref(single) }] : []),
        ...(single.annualCostNumber == null ? [{ label: "Add cost", href: rowHref(single) }] : []),
      ]
    : kept.length > 1
      ? NARROW.filter((item) => Object.keys(item.add).every((key) => filters[key as FilterKey] === undefined) && (!item.when || item.when(kept))).map((item) => ({ label: item.label, onClick: () => onFilters({ ...filters, ...item.add }) }))
      : [];
  const addable = ADDABLE.filter((key) => filters[key] === undefined && (key === "ai_on" || key === "owner" || key === "renewal_within_days" || chipOptions(key, facts).length > 0));

  return (
    <div data-testid="ask-records" className="[&:not(:first-child)]:mt-4">
      <h2 data-testid="ask-lean-headline" title={lean.title ?? undefined} className="truncate text-[17px] font-semibold leading-6 text-[#1c2230]">
        {lean.names.length ? (
          <>
            Yes —{" "}
            {lean.names.map((row, index) => (
              <span key={row.id}>
                {index > 0 && ", "}
                <a href={rowHref(row)} className="text-[#4c3fd1] underline decoration-[#c9c6f5] underline-offset-[3px] hover:decoration-[#4c3fd1]">{row.name}</a>
              </span>
            ))}
          </>
        ) : animate && lean.title ? (
          <span data-testid="ask-headline-words">
            {/* The space sits between the inline-block words: a trailing space inside an inline-block collapses. */}
            {lean.title.split(/\s+/).filter(Boolean).map((word, index) => (
              <React.Fragment key={index}>
                {index > 0 && " "}
                <span className="ask-word" style={{ animationDelay: `${index * 90}ms` }}>{word}</span>
              </React.Fragment>
            ))}
          </span>
        ) : lean.title}
      </h2>
      {/* One small summary line; the chips and filters open under Details. */}
      <div data-testid="ask-summary" className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-[#6b7289]">
        {summaryParts.map((part, index) => (
          <React.Fragment key={part.text}>
            {index > 0 && <span aria-hidden className="text-[#c3c7d2]">·</span>}
            <span className={part.warn ? "text-[#a35a00]" : undefined}>{part.warn ? "⚠ " : ""}{part.text}</span>
          </React.Fragment>
        ))}
        <button type="button" data-testid="ask-details-toggle" aria-expanded={details} onClick={() => setDetails(!details)} className="ml-1 font-medium text-[#5b4ce6] hover:underline">
          {details ? "Hide details" : "Details"} <span aria-hidden>{details ? "▴" : "▾"}</span>
        </button>
      </div>
      {prose && (
        <div data-testid="ask-prose" className="mt-1.5">
          <button type="button" data-testid="ask-prose-toggle" aria-expanded={proseOpen} onClick={() => setProseOpen(!proseOpen)} className="text-[12px] font-medium text-[#5b4ce6] hover:underline">
            <span aria-hidden className={`mr-1 inline-block transition-transform ${proseOpen ? "rotate-90" : ""}`}>▸</span>
            {proseOpen ? "Hide summary" : "Show summary"}
          </button>
          {proseOpen && <div data-testid="ask-prose-body" className="mt-1 [&>ul]:mt-1">{prose}</div>}
        </div>
      )}
      {details && (
        <div data-testid="ask-details" className="mt-2">
      {(lean.kinds.length > 0 || lean.gaps.length > 0 || lean.inferredVendor) && (
        <div className="flex flex-wrap gap-1.5" data-testid="ask-lean-chips">
          {lean.kinds.map((kind) => <MetaChip key={kind.label} text={`${kind.count} ${kind.label}`} />)}
          {lean.gaps.map((gap) => <GapChip key={gap} text={gap} />)}
          {lean.inferredVendor && <MetaChip text="Vendor from catalogue" testId="ask-vendor-inferred" />}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="ask-filter-chips">
        {keys.map((key) => {
          const options = chipOptions(key, facts);
          const op = opOf(filters, key);
          const valueless = op === "is_empty" || op === "is_not_empty";
          const editable = options.length > 1 && key !== "ai_on" && key !== "owner";
          return (
            <span key={key} data-filter={key} data-op={op} className="inline-flex items-center gap-1 rounded-lg bg-[#ece9ff] py-0.5 pl-2 pr-1 text-[12px] font-medium text-[#3d2fc0]">
              <span className="font-normal text-[#6b5fd6]">{FILTER_LABEL[key]}</span>
              {OP_KEYS.includes(key) ? (
                <select
                  aria-label={`${FILTER_LABEL[key]} operator`}
                  data-testid="ask-filter-op"
                  value={op}
                  onChange={(event) => setOp(key, event.target.value as FilterOp)}
                  className="cursor-pointer bg-transparent font-normal text-[#6b5fd6] outline-none"
                >
                  {OPS.map((item) => <option key={item} value={item}>{OP_LABEL[item]}</option>)}
                </select>
              ) : null}
              {valueless ? null : editable ? (
                <select
                  aria-label={FILTER_LABEL[key]}
                  value={String(filters[key])}
                  onChange={(event) => set(key, event.target.value)}
                  className="cursor-pointer bg-transparent font-semibold text-[#3d2fc0] outline-none"
                >
                  {!options.some((option) => option.value === String(filters[key])) && <option value={String(filters[key])}>{chipValue(key, filters)}</option>}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <span className="font-semibold">{chipValue(key, filters)}</span>
              )}
              <button type="button" aria-label={`Remove ${FILTER_LABEL[key]}`} onClick={() => set(key, undefined)} className="rounded p-0.5 text-[#8a80e0] hover:bg-[#ddd8ff]">
                <X size={12} />
              </button>
            </span>
          );
        })}
        {addable.length > 0 && (
          <select
            aria-label="Add filter"
            value=""
            onChange={(event) => {
              const key = event.target.value as FilterKey;
              if (key === "ai_on") set(key, true);
              else if (key === "owner") set(key, "none");
              else if (key === "renewal_within_days") set(key, 90);
              else set(key, chipOptions(key, facts)[0]?.value);
            }}
            className="cursor-pointer rounded-lg border border-dashed border-[#b9b2f2] bg-white px-1.5 py-0.5 text-[12px] text-[#5b4ce6] outline-none"
          >
            <option value="">+ Filter</option>
            {addable.map((key) => (
              <option key={key} value={key}>{key === "ai_on" ? "AI turned on" : key === "owner" ? "No owner" : FILTER_LABEL[key]}</option>
            ))}
          </select>
        )}
      </div>

        </div>
      )}
      {kept.length > 0 && (
        <table className="mt-2 w-full text-left text-[13px]" data-testid="ask-records-table">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Kind", "Owner", "Annual cost", "Where it runs"].map((heading) => (
                <th key={heading} className="h-10 px-2 font-medium">{heading}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((item, index) => {
              const row = item.row;
              const owner = [row.ownerTeam, row.ownerPerson].filter(Boolean).join(" · ");
              const where = [item.hosting && HOSTING[item.hosting] ? HOSTING[item.hosting].label : row.hostingLabel, ...item.tenants, ...item.regions.map((key) => regionName(key))].filter(Boolean);
              return (
                <tr key={row.id} className={`cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb] ${animate ? "ask-row-in" : ""}`} style={animate ? { animationDelay: `${300 + index * 80}ms` } : undefined} onClick={() => onOpen(row)}>
                  <td className="px-2 py-2.5 font-medium">
                    <a href={rowHref(row)} onClick={(event) => event.stopPropagation()} className="text-[#4c3fd1] underline decoration-[#c9c6f5] underline-offset-2 hover:decoration-[#4c3fd1]">{row.name}</a>
                  </td>
                  <td className="px-2 py-2.5">{row.typeLabel}</td>
                  <td className="px-2 py-2.5">{owner || <span className="rounded bg-[#fff7ed] px-1.5 py-0.5 text-[11px] text-[#9a3412]">No owner</span>}</td>
                  <td className="px-2 py-2.5">{row.annualCostNumber != null ? moneyLabel(row.annualCostNumber) : <span className="text-[#94a3b8]">—</span>}</td>
                  <td className="px-2 py-2.5 text-[#6b7289]">{where.join(" · ") || "—"}</td>
                  <td className="text-[#94a3b8]"><ChevronRight size={14} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {kept.length > LEAN_ROWS && (
        <button type="button" data-testid="ask-show-more" onClick={() => setAll(!all)} className="px-2 py-2 text-[12px] font-medium text-[#5b4ce6] hover:underline">
          {all ? "Show fewer" : `Show ${kept.length - LEAN_ROWS} more`}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-start gap-2 text-[12px]">
      <details className="group min-w-0 flex-1 text-[12px]" data-testid="ask-how">
        <summary className="cursor-pointer list-none font-semibold text-[#5b4ce6] [&::-webkit-details-marker]:hidden"><span className="inline-block transition-transform group-open:rotate-90">▸</span> How I found this</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-[#4a5068]">
          {records.terms.length > 0 && (
            <li>
              Found {records.terms.map((term, index) => (
                <span key={`${term.key}-${term.value}`}>{index > 0 ? ", " : ""}“{term.text}” ({FILTER_LABEL[term.key].toLowerCase()} in your data)</span>
              ))} in the question.
            </li>
          )}
          {records.ids ? (
            <>
              <li>The AI read your whole workspace and named {kept.length === 1 ? "this item" : `these ${kept.length} items`}.</li>
              <li>Each row is shown from your data, not from the AI's words. Adding a filter re-runs it here without the AI.</li>
            </>
          ) : (
            <>
              {records.source === "ai" && <li>The AI looked this up with filters, and every item was checked against your catalogue.</li>}
              <li>
                Filters: {keys.length ? keys.map((key) => filterLine(key, filters)).join("; ") : "none"}.
                {filters.vendor ? " Vendor matches the vendor field, the catalogue vendor, cost-line vendors and a tenant's cloud provider." : ""}
              </li>
              <li>Looked through {facts.length} items and kept {kept.length}. Every name and number above comes from your catalogue{records.source === "quick" ? ", with no AI used" : ""}. Changing a filter re-runs it here without the AI.</li>
            </>
          )}
        </ol>
      </details>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="ask-narrow">
        {follow.slice(0, 2).map((item) => <FollowPill key={item.label} {...item} />)}
      </div>
      </div>
      {footerExtra}
    </div>
  );
}
