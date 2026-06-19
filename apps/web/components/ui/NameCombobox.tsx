"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface NameComboboxOption {
  id: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (label: string, option?: NameComboboxOption) => void;
  options: NameComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  emptyMessage?: string;
}

export function NameCombobox({
  value,
  onChange,
  options,
  placeholder = "Select or type…",
  disabled = false,
  required = false,
  hint,
  emptyMessage = "No matches — use what you typed",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(normalizedQuery)
  );
  const showList = open && !disabled;
  const exactMatch = options.find(
    (option) => option.label.toLowerCase() === normalizedQuery
  );

  function commit(nextQuery: string) {
    const trimmed = nextQuery.trim();
    const match = options.find((option) => option.label.toLowerCase() === trimmed.toLowerCase());
    onChange(trimmed, match);
    setQuery(trimmed);
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) {
        commit(query);
        setOpen(false);
      }
    }, 0);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            const match = options.find(
              (option) => option.label.toLowerCase() === next.trim().toLowerCase()
            );
            onChange(next, match);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(query);
              setOpen(false);
            }
            if (e.key === "Escape") {
              setQuery(value);
              setOpen(false);
            }
          }}
          list={listId}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          className="w-full rounded-md border border-gray-200 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
      </div>

      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>

      {showList && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(option.label, option);
                    setQuery(option.label);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
                    value === option.label || exactMatch?.id === option.id
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-700"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-xs text-gray-400">{emptyMessage}</li>
          )}
        </ul>
      )}

      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
