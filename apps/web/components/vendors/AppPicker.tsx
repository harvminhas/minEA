"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CatalogRow } from "@/lib/model-catalog";

/** Type to find an app in the estate, or create it right here ('+ Create "…"'). */
export function AppPicker({
  rows,
  excludeIds = [],
  placeholder = "Add app… type to search or create",
  onPick,
  onCreate,
}: {
  rows: readonly CatalogRow[];
  excludeIds?: string[];
  placeholder?: string;
  onPick: (row: CatalogRow) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? rows.filter((row) => !excludeIds.includes(row.id) && row.name.toLowerCase().includes(needle)).slice(0, 6)
    : [];
  const exact = rows.some((row) => row.name.trim().toLowerCase() === needle);
  const done = () => {
    setQ("");
    setOpen(false);
  };
  return (
    <div className="relative w-[260px]">
      <input
        aria-label="Add app"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") done();
          if (e.key === "Enter" && needle) {
            if (matches[0] && matches[0].name.toLowerCase() === needle) onPick(matches[0]);
            else if (!exact) onCreate(q.trim());
            done();
          }
        }}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[12.5px] outline-none focus:border-[#c9c3f7]"
      />
      {open && needle && (
        <div className="absolute left-0 top-9 z-30 w-full rounded-md border border-[#e6e8ee] bg-white py-1 shadow-lg">
          {matches.map((row) => (
            <button key={row.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(row); done(); }} className="block w-full px-2 py-1.5 text-left text-[12.5px] hover:bg-[#f6f5ff]">
              {row.name} <span className="text-[#8b90a0]">{row.vendor}</span>
            </button>
          ))}
          {!exact && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCreate(q.trim()); done(); }} className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[12.5px] font-medium text-[#5b4ce6] hover:bg-[#f6f5ff]">
              <Plus size={12} /> Create app “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
