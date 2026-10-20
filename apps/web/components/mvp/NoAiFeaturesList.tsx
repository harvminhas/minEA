"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { groupNames, othersLine } from "@/lib/setup/ai-others";

/** Collapsed "N apps have no known AI features"; opens to an A-Z multi-column list. */
export function NoAiFeaturesList({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  if (!names.length) return null;
  const groups = groupNames(names);
  return (
    <div className="mt-3 text-[13px] text-[#6b7289]" data-testid="no-ai-others">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center gap-1 hover:text-[#1c2230]">
        <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        {othersLine(names.length)}
      </button>
      {open && (
        <ul className="ml-5 mt-2 columns-2 gap-6 sm:columns-3" data-testid="no-ai-list">
          {groups.map((item) => (
            <li key={item.name.toLowerCase()} className="break-inside-avoid truncate py-0.5 text-[#4b5163]" title={item.name}>
              {item.name}
              {item.count > 1 && <span className="ml-1 text-[#8b90a0]">×{item.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
