"use client";

import Link from "next/link";
import type { AskChart, AskTable } from "@/lib/ask/rich";

/** Table built from lookup results; each row opens its record page. */
/** Covers a cell with a link to the row's record (behind the cell's own content). */
function CellLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      data-testid="ask-rich-cell-link"
      aria-label={`Open ${label}`}
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      className="absolute inset-0"
    />
  );
}

export function AskRichTable({
  table,
  hrefFor,
  onOpen,
  itemHref,
}: {
  table: AskTable;
  hrefFor: (row: { recordId: string | null; label: string }) => string | null;
  onOpen: (href: string) => void;
  /** Link for an item named inside a row (a vendor's apps). */
  itemHref?: (id: string) => string | null;
}) {
  return (
    <table data-testid="ask-rich-table" className="mt-6 w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-[#eef0f4] text-[#6b7289]">
          {table.columns.map((column, index) => (
            <th key={`${index}-${column}`} className="h-9 px-2 font-medium">{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, index) => {
          const href = hrefFor(row);
          return (
            <tr
              key={`${index}-${row.label}`}
              data-href={href ?? undefined}
              onClick={() => href && onOpen(href)}
              className={`border-b border-[#f3f4f8] ${href ? "cursor-pointer hover:bg-[#fafafb]" : ""}`}
            >
              <td className="px-2 py-2.5 font-medium text-[#1c2230]">
                {href ? <Link href={href} onClick={(event) => event.stopPropagation()} className="text-[#5b4ce6] hover:underline">{row.label}</Link> : row.label}
              </td>
              <td className={`relative px-2 py-2.5 ${row.value.startsWith("No ") ? "text-[#8b90a0]" : "text-[#1c2230]"}`}>
                {href && <CellLink href={href} label={row.label} />}
                <span className="relative">{row.value}</span>
              </td>
              <td data-testid="ask-rich-detail" className="relative px-2 py-2.5 text-[#6b7289]">
                {/* A real link under the whole cell: empty space opens the row's record even if the row
                    handler never fires; the app links sit above it and open their own records. */}
                {href && <CellLink href={href} label={row.label} />}
                <span className="relative">
                {row.items?.length && itemHref
                  ? row.items.map((item, itemIndex) => {
                      const link = itemHref(item.id);
                      return (
                        <span key={`${itemIndex}-${item.id}`}>
                          {itemIndex > 0 && ", "}
                          {link ? (
                            // The app's own link; the rest of the cell (and row) opens the row's record.
                            <Link href={link} onClick={(event) => event.stopPropagation()} className="hover:text-[#5b4ce6] hover:underline">
                              {item.name}
                            </Link>
                          ) : (
                            item.name
                          )}
                        </span>
                      );
                    })
                  : row.detail}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
      <caption className="caption-bottom pt-2 text-left text-[12px] text-[#8b90a0]">
        {table.rows.length} {table.kind === "vendors" ? (table.rows.length === 1 ? "vendor" : "vendors") : table.rows.length === 1 ? "item" : "items"}
      </caption>
    </table>
  );
}

/** A tiny horizontal bar chart: no chart library. */
export function AskBarChart({ chart }: { chart: AskChart }) {
  const max = Math.max(...chart.bars.map((bar) => bar.value), 1);
  return (
    <figure data-testid="ask-chart" className="mt-6">
      <figcaption className="mb-2 text-[12px] font-medium text-[#6b7289]">{chart.title}</figcaption>
      <div className="space-y-1.5">
        {chart.bars.map((bar, index) => (
          <div key={`${index}-${bar.label}`} className="flex items-center gap-2 text-[12px]">
            <span className="w-32 shrink-0 truncate text-[#3c4254]" title={bar.label}>{bar.label}</span>
            <div className="h-3 flex-1 rounded bg-[#f3f2ff]">
              <div className="h-3 rounded bg-[#5b4ce6]" style={{ width: `${Math.max(2, (bar.value / max) * 100)}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-[#1c2230]">${bar.value.toLocaleString("en-US")}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
