"use client";

import type { PeopleContact } from "@minea/types";
import { cn } from "@/lib/utils";

/** Team lead as a contact. A lead typed in before contacts existed shows as its own entry until replaced. */
export function LeadPicker({
  contacts,
  value,
  legacyName,
  onChange,
  disabled,
  className,
}: {
  contacts: PeopleContact[];
  value: string | null | undefined;
  legacyName?: string | null;
  onChange: (contactId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const legacy = !value && legacyName?.trim() ? legacyName.trim() : null;
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select
      aria-label="Team lead"
      value={value ?? (legacy ? "__legacy" : "")}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value !== "__legacy") onChange(e.target.value || null);
      }}
      className={cn(
        "rounded-md border border-[#e6e8ee] bg-white px-2 py-1 text-[13px] text-[#1c2230]",
        className,
      )}
    >
      {legacy && <option value="__legacy">{legacy} (not a contact)</option>}
      <option value="">No lead</option>
      {sorted.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.team_name ? ` · ${c.team_name}` : ""}
        </option>
      ))}
    </select>
  );
}
