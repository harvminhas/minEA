"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { peekOrgDraft, type AddDraft } from "@/lib/add-draft";

/** Plan & billing: "Your list of 70 items is waiting" with the way back to the add box. */
export function AddDraftReturn({ orgSlug }: { orgSlug: string }) {
  const [draft, setDraft] = useState<AddDraft | null>(null);
  useEffect(() => setDraft(peekOrgDraft(orgSlug)), [orgSlug]);
  if (!draft) return null;
  return (
    <div data-testid="add-draft-return" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
      <span>Your list of {draft.count} {draft.count === 1 ? "item" : "items"} is waiting on the add cards.</span>
      <Link href={draft.returnTo} className="font-medium text-indigo-700 underline-offset-2 hover:underline">Back to your list</Link>
    </div>
  );
}
