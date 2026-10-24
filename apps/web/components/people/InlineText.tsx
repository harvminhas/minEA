"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/** Click to edit; Enter or leaving the field saves, Escape cancels. */
export function InlineText({
  value,
  placeholder,
  multiline,
  label,
  onSave,
  className,
}: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  label: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };
  if (editing) {
    const common = {
      "aria-label": label,
      autoFocus: true,
      value: draft,
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        } else if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
          e.preventDefault();
          commit();
        }
      },
      className: cn(
        "w-full rounded-md border border-[#c9c3f7] bg-white px-2 py-1 outline-none",
        className,
      ),
    };
    return multiline ? (
      <textarea
        {...common}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
      />
    ) : (
      <input {...common} onChange={(e) => setDraft(e.target.value)} />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Edit ${label.toLowerCase()}`}
      onClick={() => setEditing(true)}
      className={cn("group inline-flex items-center gap-1.5 text-left", className)}
    >
      <span className={value ? "" : "text-[#8b90a0]"}>{value || placeholder}</span>
      <Pencil size={12} className="shrink-0 text-[#b4b8c4] group-hover:text-[#5b4ce6]" />
    </button>
  );
}
