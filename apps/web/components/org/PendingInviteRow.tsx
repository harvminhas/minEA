"use client";

import { useState } from "react";
import { RowStatusBadge } from "@/components/org/OrgMembersTable";
import { friendlyError, runRowAction, type Overrides } from "@/lib/row-saving";

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  /** "Main · Member, EMEA · Viewer"; replaces the role line when set. */
  access?: string;
  /** The link can be copied again (otherwise Resend invite makes a new one). */
  canCopy?: boolean;
}

/** What Resend gives back: the new link, and whether the email went out. */
export type Resent = string | { url: string; emailSent: boolean | null | undefined };

/**
 * One pending invite with Resend / Revoke. Each shows Saving… on the row, then a tick (Resend
 * shows the new link), and rolls back with the API's message on failure.
 */
export function PendingInviteRow({
  invite,
  onResend,
  onRevoke,
  onCopyLink,
  onAddAccess,
}: {
  invite: PendingInvite;
  /** Resolves to the new invite URL (absolute), or that plus whether it was emailed. */
  onResend: (id: string) => Promise<Resent>;
  onRevoke: (id: string) => unknown;
  /** Resolves to the absolute link to copy. */
  onCopyLink?: (id: string) => Promise<string>;
  onAddAccess?: () => void;
}) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [link, setLink] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [action, setAction] = useState<"resend" | "revoke" | null>(null);
  const o = overrides[invite.id];
  if (o?.hidden) return null;
  const saving = o?.status === "saving";

  return (
    <div data-testid="invite-row" data-status={o?.status ?? "idle"}>
      <div className={`py-2 flex justify-between items-center text-sm ${o?.removing ? "opacity-50" : ""}`}>
        <div>
          <p className="font-medium">
            {invite.email}
            <span className="ml-2 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-px text-[11px] font-medium text-amber-800" data-testid="pending-badge">
              Pending
            </span>
          </p>
          <p className={`text-gray-400 ${invite.access ? "" : "capitalize"}`}>
            {invite.access ?? invite.role} · expires {new Date(invite.expires_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {action === "resend" && o?.status === "saving" ? (
            <RowStatusBadge status="saving" />
          ) : action === "resend" && o?.status === "saved" ? (
            emailFailed ? (
              <span className="text-xs text-amber-700" data-testid="row-email-failed">Email didn&apos;t send — copy the link instead</span>
            ) : (
              <span className="text-xs text-emerald-600" data-testid="row-saved">✓ Sent</span>
            )
          ) : (
            action === "revoke" && <RowStatusBadge status={o?.status === "error" ? undefined : o?.status} removing />
          )}
          {copyMsg && <span className="text-xs text-emerald-600" data-testid="invite-copied">{copyMsg}</span>}
          {!o?.removing && (
            <>
              {onCopyLink && invite.canCopy !== false && (
                <button
                  data-testid="invite-copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(await onCopyLink(invite.id));
                      setCopyMsg("✓ Copied");
                    } catch (e) {
                      setCopyMsg(null);
                      setOverrides((x) => ({ ...x, [invite.id]: { status: "error", error: friendlyError(e) } }));
                    }
                  }}
                  disabled={saving}
                  className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50 text-xs"
                >
                  Copy link
                </button>
              )}
              {onAddAccess && (
                <button data-testid="invite-add-access" onClick={onAddAccess} disabled={saving} className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50 text-xs">
                  Add to workspace
                </button>
              )}
              <button
                data-testid="invite-resend"
                onClick={() => {
                  setAction("resend");
                  void runRowAction(
                    invite.id,
                    {},
                    async () => {
                      const r = await onResend(invite.id);
                      setLink(typeof r === "string" ? r : r.url);
                      setEmailFailed(typeof r !== "string" && r.emailSent === false);
                    },
                    setOverrides
                  );
                }}
                disabled={saving}
                className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50 text-xs"
              >
                Resend invite
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
