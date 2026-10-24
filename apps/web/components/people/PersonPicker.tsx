"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { PeopleContact } from "@minea/types";
import { canCreatePerson, matchPeople } from "@/lib/people";
import { cn } from "@/lib/utils";

/** What was picked: an existing person, nobody, or a new person to create (the caller creates it). */
export type PersonChoice =
  | { contactId: string }
  | { contactId: null }
  | { create: { name: string; email: string | null; title: string | null } };

const input = "w-full rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#1c2230] outline-none focus:border-[#c9c3f7]";

/**
 * Pick a person from People, or add one right here: typing a name nobody has offers
 * '+ New person "…"', which opens a small form (name, optional email, optional title).
 */
export function PersonPicker({
  people,
  value,
  onPick,
  label,
  placeholder = "Pick a person…",
  noneLabel,
  legacyName,
  withTitle,
  createLabel = "Create",
  excludeIds = [],
  disabled,
  defaultOpen = false,
  defaultQuery = "",
  defaultCreating = false,
  align = "left",
  className,
}: {
  people: PeopleContact[];
  value?: string | null;
  onPick: (choice: PersonChoice) => void;
  label: string;
  placeholder?: string;
  /** Offer a "nobody" row (e.g. "No lead"). */
  noneLabel?: string;
  /** A name typed before People existed, shown until replaced. */
  legacyName?: string | null;
  /** Ask for a title in the new-person form (e.g. title on this team). */
  withTitle?: string;
  createLabel?: string;
  excludeIds?: string[];
  disabled?: boolean;
  defaultOpen?: boolean;
  defaultQuery?: string;
  defaultCreating?: boolean;
  /** Open the menu toward the left when the picker sits at the right edge. */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState(defaultQuery);
  const [creating, setCreating] = useState(defaultCreating);
  const [draft, setDraft] = useState({ name: defaultQuery, email: "", title: "" });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = people.find((p) => p.id === value);
  const shown = current?.name ?? (!value && legacyName?.trim() ? `${legacyName.trim()} (not in People)` : null);
  const pool = people.filter((p) => !excludeIds.includes(p.id));
  const hits = matchPeople(pool, q);
  const offerNew = canCreatePerson(people, q);

  const finish = (choice: PersonChoice) => {
    onPick(choice);
    setOpen(false);
    setCreating(false);
    setQ("");
  };

  return (
    <div ref={box} className={cn("relative inline-block min-w-[220px] text-[13px]", className)}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-left text-[#1c2230] disabled:opacity-50"
      >
        <span className={shown ? "" : "text-[#8b90a0]"}>{shown ?? placeholder}</span>
        <ChevronDown size={14} className="text-[#8b90a0]" />
      </button>
      {open && (
        <div className={cn("absolute z-[60]", align === "right" ? "right-0" : "left-0", "mt-1 w-[300px] rounded-lg border border-[#e6e8ee] bg-white p-2 shadow-lg")} data-testid="person-picker">
          {creating ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = draft.name.trim().replace(/\s+/g, " ");
                if (!name) return;
                finish({ create: { name, email: draft.email.trim() || null, title: draft.title.trim() || null } });
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]">New person</p>
              <input aria-label="Name" autoFocus className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" />
              <input aria-label="Email" className={input} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email (optional)" />
              {withTitle && (
                <input aria-label="Title" className={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={`${withTitle} (optional)`} />
              )}
              <div className="flex items-center gap-2">
                <button type="submit" disabled={!draft.name.trim()} className="rounded-md bg-[#5b4ce6] px-3 py-1.5 font-medium text-white disabled:opacity-40">
                  {createLabel}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="text-[#8b90a0]">
                  Back
                </button>
              </div>
            </form>
          ) : (
            <>
              <input aria-label={`Search ${label.toLowerCase()}`} autoFocus className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…" />
              <ul className="mt-1 max-h-[240px] overflow-y-auto">
                {noneLabel && !q && (
                  <li>
                    <button type="button" onClick={() => finish({ contactId: null })} className="w-full rounded px-2 py-1.5 text-left text-[#8b90a0] hover:bg-[#f5f6f9]">
                      {noneLabel}
                    </button>
                  </li>
                )}
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => finish({ contactId: p.id })}
                      className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-[#f5f6f9]", p.id === value && "bg-[#f1efff]")}
                    >
                      <span className="text-[#1c2230]">{p.name}</span>
                      <span className="truncate pl-2 text-[12px] text-[#8b90a0]">{p.title || p.team_name || p.email || ""}</span>
                    </button>
                  </li>
                ))}
                {q.trim() && hits.length === 0 && <li className="px-2 py-1.5 text-[#8b90a0]">No match in People</li>}
                {offerNew && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft({ name: q.trim(), email: "", title: "" });
                        setCreating(true);
                      }}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-medium text-[#5b4ce6] hover:bg-[#f1efff]"
                    >
                      <Plus size={13} /> New person “{q.trim()}”
                    </button>
                  </li>
                )}
                {!q && pool.length === 0 && <li className="px-2 py-1.5 text-[#8b90a0]">Type a name to add someone</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
