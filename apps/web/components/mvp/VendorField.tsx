"use client";

import { useMemo, useState } from "react";
import { knownVendors } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";

export function VendorField({
  value,
  onChange,
  className,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const catalog = useModelCatalog();
  const options = useMemo(() => knownVendors(catalog.data?.rows ?? []), [catalog.data?.rows]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = value.trim().toLowerCase();
  const matches = options
    .filter((name) => !query || name.toLowerCase().includes(query))
    .filter((name) => name.toLowerCase() !== query)
    .slice(0, 8);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open || matches.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(matches.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            choose(matches[active] ?? matches[0]);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#e6e8ee] bg-white py-1 shadow-lg">
          {matches.map((name, index) => (
            <li key={name}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-[13px] ${index === active ? "bg-[#f3f0ff] text-[#1c2230]" : "text-[#3c4254]"}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(name);
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
