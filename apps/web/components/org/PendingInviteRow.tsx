"use client";

import { useState } from "react";
import { RowStatusBadge } from "@/components/org/OrgMembersTable";
import { runRowAction, type Overrides } from "@/lib/row-saving";

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

/**
 * One pending invite with Resend / Revoke. Each shows Saving… on the row, then a tick (Resend
 * shows the new link), and rolls back with the API's message on failure.
 */
export function PendingInviteRow({
  invite,
  onResend,
  onRevoke,
}: {
  invite: PendingInvite;
  /** Resolves to the new invite URL (absolute). */
  onResend: (id: string) => Promise<string>;
  onRevoke: (id: string) => unknown;
}) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [link, setLink] = useState<string | null>(null);
  const [action, setAction] = useState<"resend" | "revoke" | null>(null);
  const o = overrides[invite.id];
  if (o?.hidden) return null;
  const saving = o?.status === "saving";

  return (
    <div data-testid="invite-row" data-status={o?.status ?? "idle"}>
      <div className={`py-2 flex justify-between items-center text-sm ${o?.removing ? "opacity-50" : ""}`}>
        <div>
          <p className="font-medium">{invite.email}</p>
          <p className="text-gray-400 capitalize">
            {invite.role} · expires {new Date(invite.expires_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {action === "resend" && o?.status === "saving" ? (
            <RowStatusBadge status="saving" />
          ) : action === "resend" && o?.status === "saved" ? (
            <span className="text-xs text-emerald-600" data-testid="row-saved">✓ Sent</span>
          ) : (
            action === "revoke" && <RowStatusBadge status={o?.status === "error" ? undefined : o?.status} removing />
          )}
          {!o?.removing && (
            <>
              <button
                data-testid="invite-resend"
                onClick={() => {
                  setAction("resend");
                  void runRowAction(invite.id, {}, async () => setLink(await onResend(invite.id)), setOverrides);
                }}
                disabled={saving}
                className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50 text-xs"
              >
                Resend
              </button>
              <button
                data-testid="invite-revoke"
                onClick={() => {
                  setAction("revoke");
                  void runRowAction(invite.id, { removing: true }, () => onRevoke(invite.id), setOverrides);
                }}
                disabled={saving}
                className="text-red-600 hover:text-red-800 disabled:opacity-50 text-xs"
              >
                Revoke
              </button>
            </>
          )}
        </div>
      </div>
      {o?.status === "error" && (
        <p className="text-xs text-red-600 pb-2" role="alert" data-testid="invite-row-error">
          {o.error}
        </p>
      )}
      {link && !o?.removing && (
        <p className="text-xs text-gray-600 pb-2 break-all" data-testid="invite-resent-link">
          New link (the old one no longer works, valid 7 days):{" "}
          <a href={link} className="text-indigo-600 underline">{link}</a>
        </p>
      )}
    </div>
  );
}
