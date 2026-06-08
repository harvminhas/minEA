"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Box } from "lucide-react";
import {
  formatTechDebtAgeShort,
  sortTechDebtTableRows,
  techDebtObjectName,
  techDebtSeverityBadgeLabel,
  type TechDebtTableSortKey,
  type TechDebtViewRow,
} from "@/lib/tech-debt-view-utils";
import { SEVERITY_STYLE } from "@/lib/tech-debt-utils";
import { cn } from "@/lib/utils";

const AGE_ALERT_DAYS = 7;
const COL_COUNT = 8;

function SortHeader({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-4 py-2.5 text-left bg-gray-50 border-b border-gray-200", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          active ? "text-gray-700" : "text-gray-400 hover:text-gray-600"
        )}
      >
        {label}
        <ArrowUpDown size={11} className={active ? "text-gray-500" : "text-gray-300"} />
      </button>
    </th>
  );
}

function AssigneeCell({ owner }: { owner: string | null | undefined }) {
  const name = owner?.trim();
  if (!name) {
    return <span className="text-sm text-red-600 font-medium">Unassigned</span>;
  }
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
        {initial}
      </span>
      <span className="text-sm text-gray-800 truncate">{name}</span>
    </div>
  );
}

function DebtTableRow({
  row,
  selected,
  onToggleSelect,
  onOpen,
  onLink,
}: {
  row: TechDebtViewRow;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onLink?: () => void;
}) {
  const severity = row.props.severity ?? "medium";
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.medium;
  const objectName = techDebtObjectName(row);
  const ageAlert = row.ageDays >= AGE_ALERT_DAYS;

  return (
    <tr className="border-b border-gray-100 hover:bg-stone-50/80 transition-colors">
      <td className="px-4 py-3 w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
          aria-label={`Select ${row.item.name}`}
        />
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border",
            style.border,
            style.bg,
            style.text
          )}
        >
          {techDebtSeverityBadgeLabel(severity)}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <button
          type="button"
          onClick={onOpen}
          className="font-semibold text-gray-900 text-sm text-left hover:text-indigo-700 truncate block max-w-full"
        >
          {row.item.name}
        </button>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{row.typeLabel}</td>
      <td className="px-4 py-3 max-w-[180px]">
        {objectName ? (
          <span className="inline-flex items-center gap-1.5 text-xs bg-gray-50 text-gray-700 border border-gray-200 rounded-full px-2.5 py-1 max-w-full">
            <Box size={12} className="text-gray-400 shrink-0" />
            <span className="truncate">{objectName}</span>
          </span>
        ) : onLink ? (
          <button
            type="button"
            onClick={onLink}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Link to object →
          </button>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {row.rollupProducts.length > 0 ? (
            row.rollupProducts.map((p) => (
              <span
                key={p.id}
                className="text-[10px] bg-white text-gray-600 border border-gray-200 rounded px-1.5 py-0.5"
              >
                {p.name}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 min-w-[140px]">
        <AssigneeCell owner={row.item.owner} />
      </td>
      <td className="px-4 py-3 text-sm whitespace-nowrap">
        <span className={cn(ageAlert ? "text-red-600 font-medium" : "text-gray-600")}>
          {formatTechDebtAgeShort(row.ageDays)}
        </span>
      </td>
    </tr>
  );
}

function SectionHeaderRow({ label }: { label: string }) {
  return (
    <tr className="bg-gray-50/90">
      <td
        colSpan={COL_COUNT}
        className="px-4 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
      >
        {label}
      </td>
    </tr>
  );
}

export function TechDebtTable({
  attached,
  unattached,
  onOpen,
  onLink,
}: {
  attached: TechDebtViewRow[];
  unattached: TechDebtViewRow[];
  onOpen: (id: string) => void;
  onLink?: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<TechDebtTableSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSort = (key: TechDebtTableSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "object" ? "asc" : "desc");
    }
  };

  const sortedAttached = useMemo(
    () => (sortKey ? sortTechDebtTableRows(attached, sortKey, sortDir) : attached),
    [attached, sortKey, sortDir]
  );
  const sortedUnattached = useMemo(
    () => (sortKey ? sortTechDebtTableRows(unattached, sortKey, sortDir) : unattached),
    [unattached, sortKey, sortDir]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-10 px-4 py-2.5 bg-gray-50 border-b border-gray-200" />
              <SortHeader
                label="Severity"
                active={sortKey === "severity"}
                onClick={() => toggleSort("severity")}
              />
              <SortHeader label="Name" active={sortKey === "name"} onClick={() => toggleSort("name")} />
              <SortHeader label="Type" active={sortKey === "type"} onClick={() => toggleSort("type")} />
              <SortHeader
                label="Object"
                active={sortKey === "object"}
                onClick={() => toggleSort("object")}
              />
              <SortHeader
                label="Products"
                active={sortKey === "products"}
                onClick={() => toggleSort("products")}
              />
              <SortHeader
                label="Assignee"
                active={sortKey === "assignee"}
                onClick={() => toggleSort("assignee")}
              />
              <th className="px-4 py-2.5 text-left bg-gray-50 border-b border-gray-200">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Age
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedAttached.length > 0 && (
              <>
                <SectionHeaderRow label={`Attached · ${sortedAttached.length} items`} />
                {sortedAttached.map((row) => (
                  <DebtTableRow
                    key={row.item.id}
                    row={row}
                    selected={selectedIds.has(row.item.id)}
                    onToggleSelect={() => toggleSelect(row.item.id)}
                    onOpen={() => onOpen(row.item.id)}
                  />
                ))}
              </>
            )}
            {sortedUnattached.length > 0 && (
              <>
                <SectionHeaderRow label={`Unattached · ${sortedUnattached.length} items`} />
                {sortedUnattached.map((row) => (
                  <DebtTableRow
                    key={row.item.id}
                    row={row}
                    selected={selectedIds.has(row.item.id)}
                    onToggleSelect={() => toggleSelect(row.item.id)}
                    onOpen={() => onOpen(row.item.id)}
                    onLink={onLink ? () => onLink(row.item.id) : undefined}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
