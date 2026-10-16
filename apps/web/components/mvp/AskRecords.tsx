"use client";

import { useMemo } from "react";
import { ChevronRight, X } from "lucide-react";
import type { AskAnswer } from "@/lib/ask/deterministic";
import { chipOptions, chipValue, FILTER_KEYS, FILTER_LABEL, filterFacts, providerLabel, regionName, HOSTING, type FilterKey, type RecordFacts, type RecordFilters } from "@/lib/ask/record-filter";
import { moneyLabel, type CatalogRow } from "@/lib/model-catalog";

/** Filters a person can add from the "+ Add filter" menu (each re-runs locally, no AI). */
const ADDABLE: FilterKey[] = ["vendor", "owner_team", "owner", "hosting", "provider", "tenant", "region", "ai_on", "renewal_within_days", "criticality"];
/** Narrow-it-down chips under a list answer: they add a filter, they don't ask a new question. */
const NARROW: { label: string; add: RecordFilters }[] = [
  { label: "Which of these renew in the next 90 days?", add: { renewal_within_days: 90 } },
  { label: "Which of these have no owner?", add: { owner: "none" } },
  { label: "Which of these have AI turned on?", add: { ai_on: true } },
];

export function AskRecordsBlock({
  answer,
  facts,
  onFilters,
  onOpen,
  rowHref,
}: {
  answer: AskAnswer;
  facts: RecordFacts[];
  onFilters: (filters: RecordFilters) => void;
  onOpen: (row: CatalogRow) => void;
  rowHref: (row: CatalogRow) => string;
}) {
  const records = answer.records!;
  const filters = records.filters;
  const kept = useMemo(() => filterFacts(facts, filters), [facts, filters]);
  const keys = FILTER_KEYS.filter((key) => filters[key] !== undefined);
  const set = (key: FilterKey, value: unknown) => {
    const next = { ...filters } as Record<string, unknown>;
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onFilters(next as RecordFilters);
  };
  const addable = ADDABLE.filter((key) => filters[key] === undefined && (key === "ai_on" || key === "owner" || key === "renewal_within_days" || chipOptions(key, facts).length > 0));

  return (
    <div data-testid="ask-records" className="mt-4">
      <div className="flex flex-wrap items-center gap-2" data-testid="ask-filter-chips">
        {keys.map((key) => {
          const options = chipOptions(key, facts);
          const editable = options.length > 1 && key !== "ai_on" && key !== "owner";
          return (
            <span key={key} data-filter={key} className="inline-flex items-center gap-1 rounded-lg bg-[#ece9ff] py-1 pl-2.5 pr-1.5 text-[13px] font-medium text-[#3d2fc0]">
              <span className="font-normal text-[#6b5fd6]">{FILTER_LABEL[key]}</span>
              {editable ? (
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
            className="cursor-pointer rounded-lg border border-dashed border-[#b9b2f2] bg-white px-2 py-1 text-[13px] text-[#5b4ce6] outline-none"
          >
            <option value="">+ Add filter</option>
            {addable.map((key) => (
              <option key={key} value={key}>{key === "ai_on" ? "AI turned on" : key === "owner" ? "No owner" : FILTER_LABEL[key]}</option>
            ))}
          </select>
        )}
      </div>

      {kept.length > 0 && (
        <table className="mt-4 w-full text-left text-[13px]" data-testid="ask-records-table">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Kind", "Owner", "Annual cost", "Where it runs"].map((heading) => (
                <th key={heading} className="h-10 px-2 font-medium">{heading}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {kept.map((item, index) => {
              const row = item.row;
              const owner = [row.ownerTeam, row.ownerPerson].filter(Boolean).join(" · ");
              const where = [item.hosting && HOSTING[item.hosting] ? HOSTING[item.hosting].label : row.hostingLabel, ...item.tenants, ...item.regions.map((key) => regionName(key))].filter(Boolean);
              return (
                <tr key={row.id} className="cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]" onClick={() => onOpen(row)}>
                  <td className="px-2 py-2.5 font-medium">
                    <span className="mr-1.5 inline-block min-w-[18px] rounded-full bg-[#f4f3ff] text-center text-[11px] font-semibold leading-[18px] text-[#5b4ce6]">{index + 1}</span>
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

      <details className="mt-4 rounded-xl bg-[#f7f6ff] px-4 py-3 text-[13px]" data-testid="ask-how">
        <summary className="cursor-pointer font-semibold text-[#3d2fc0]">How I found this</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#4a5068]">
          {records.terms.length > 0 && (
            <li>
              Found {records.terms.map((term, index) => (
                <span key={`${term.key}-${term.value}`}>{index > 0 ? ", " : ""}“{term.text}” ({FILTER_LABEL[term.key].toLowerCase()} in your data)</span>
              ))} in the question.
            </li>
          )}
          {records.source === "ai" && <li>The AI looked this up with filters, and every item was checked against your catalogue.</li>}
          <li>
            Filters: {keys.length ? keys.map((key) => `${FILTER_LABEL[key]} = ${key === "provider" ? providerLabel(String(filters[key])) : chipValue(key, filters)}`).join("; ") : "none"}.
            {filters.vendor ? " Vendor matches the vendor field, the catalogue vendor, cost-line vendors and a tenant's cloud provider." : ""}
          </li>
          <li>Looked through {facts.length} items and kept {kept.length}. Every name and number above comes from your catalogue{records.source === "quick" ? ", with no AI used" : ""}. Changing a filter re-runs it here without the AI.</li>
        </ol>
      </details>

      <div className="mt-3 flex flex-wrap gap-2" data-testid="ask-narrow">
        {NARROW.filter((item) => Object.keys(item.add).every((key) => filters[key as FilterKey] === undefined)).map((item) => (
          <button key={item.label} type="button" onClick={() => onFilters({ ...filters, ...item.add })} className="rounded-full border border-[#d9dcf0] bg-white px-3 py-1.5 text-[13px] text-[#3d2fc0] hover:border-[#b9b2f2]">
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
