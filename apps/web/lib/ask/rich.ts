/**
 * Rich answer blocks (Ask v2 step 3): a short summary, a table whose rows open record pages, and a tiny
 * bar chart. Model answers get them from the server (built from lookup results, see loop.rich_blocks);
 * browser answers build the same shapes here from catalogue rows, so both render with one component.
 */
import type { CatalogRow } from "@/lib/model-catalog";
import { vendorRollup } from "@/lib/model-catalog";

/** items: the records named in the detail cell (vendor rows: its apps), each its own link. */
export type AskTableRow = { label: string; value: string; detail: string; recordId: string | null; items?: { id: string; name: string }[] };
export type AskTable = { kind: "vendors" | "renewals" | "cancel"; columns: [string, string, string]; rows: AskTableRow[] };
export type AskChart = { kind: "bar"; title: string; unit: "usd"; bars: { label: string; value: number }[] };

export type RichPayload = {
  summary?: string;
  table?: { kind: string; columns: string[]; rows: { label: string; value: string; detail: string; record_id: string | null; items?: { id: string; name: string }[] }[] } | null;
  chart?: { kind: string; title: string; unit: string; bars: { label: string; value: number }[] } | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function tableFromPayload(payload: RichPayload): AskTable | undefined {
  const t = payload.table;
  if (!t || !t.rows?.length || (t.kind !== "vendors" && t.kind !== "renewals")) return undefined;
  return {
    kind: t.kind,
    columns: [t.columns[0] ?? "", t.columns[1] ?? "", t.columns[2] ?? ""],
    rows: t.rows.map((row) => ({ label: row.label, value: row.value, detail: row.detail, recordId: row.record_id ?? null, ...(row.items?.length ? { items: row.items } : {}) })),
  };
}

export function chartFromPayload(payload: RichPayload): AskChart | undefined {
  const c = payload.chart;
  if (!c || c.kind !== "bar" || !c.bars?.length) return undefined;
  return { kind: "bar", title: c.title, unit: "usd", bars: c.bars.map((bar) => ({ label: bar.label, value: Number(bar.value) || 0 })) };
}

/** Every vendor, same definition and order as the server's vendor table. */
export function vendorBlocks(rows: CatalogRow[]): { table?: AskTable; chart?: AskChart } {
  const vendors = vendorRollup(rows);
  if (!vendors.length) return {};
  const table: AskTable = {
    kind: "vendors",
    columns: ["Vendor", "Spend", "Applications and infrastructure"],
    rows: vendors.map((vendor) => ({
      label: vendor.vendor,
      value: vendor.annual > 0 ? `${money(vendor.annual)} a year` : "No annual cost recorded",
      detail: vendor.items.map((item) => item.name).join(", "),
      recordId: vendor.items[0]?.id ?? null,
      items: vendor.items.map((item) => ({ id: item.id, name: item.name })),
    })),
  };
  const bars = vendors.filter((vendor) => vendor.annual > 0).map((vendor) => ({ label: vendor.vendor, value: Math.round(vendor.annual) }));
  return { table, chart: bars.length >= 2 ? { kind: "bar", title: "Spend by vendor", unit: "usd", bars } : undefined };
}

export function renewalBlocks(hits: CatalogRow[]): { table?: AskTable; chart?: AskChart } {
  const dated = hits.filter((row) => row.renewalDate);
  if (!dated.length) return {};
  const months = new Map<string, number>();
  const rows = dated.map((row) => {
    const d = row.renewalDate as Date;
    const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    months.set(key, (months.get(key) ?? 0) + (row.annualCostNumber ?? 0));
    return {
      label: row.name,
      value: row.annualCostNumber ? `${money(row.annualCostNumber)} a year` : "No annual cost recorded",
      detail: `${row.typeLabel} · renews ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      recordId: row.id,
    };
  });
  const bars = [...months].map(([label, value]) => ({ label, value: Math.round(value) }));
  return {
    table: { kind: "renewals", columns: ["Item", "Annual cost", "Renewal"], rows },
    chart: bars.some((bar) => bar.value > 0) ? { kind: "bar", title: "Renewals by month", unit: "usd", bars } : undefined,
  };
}

/** Split an answer into its first sentence (the summary line) and the rest. */
export function splitSummary(text: string, summary?: string): { summary: string; rest: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?[.!?](?:\*\*)?)(\s+|$)([\s\S]*)$/);
  if (!match) return { summary: summary || trimmed, rest: "" };
  return { summary: match[1], rest: match[3].trim() };
}
