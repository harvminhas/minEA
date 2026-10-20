"use client";

import { useState } from "react";
import { Check, Copy, Info, Loader2, X } from "lucide-react";
import type { InviteCreateBody, InviteIssued, InvitesCreated, InviteWorkspaceRole, PersonRow } from "@minea/types";
import {
  absoluteInviteUrl,
  accessSummary,
  chosenWorkspaces,
  emailStatusText,
  initialPicks,
  inviteFormError,
  isOrgAdminRole,
  parseEmails,
  ROLE_HELP,
  WORKSPACE_ROLES,
  type Picks,
} from "@/lib/invite-form";

export interface InviteDialogProps {
  /** "invite": new people (or more access for an invitee). "edit": an existing member's workspaces. */
  mode: "invite" | "edit";
  /** Workspaces you can give access to (org admins: all; workspace admins: the ones they admin). */
  workspaces: { slug: string; name: string }[];
  canInviteOrgAdmins: boolean;
  /** Opened from a workspace: that one starts ticked. */
  preselect?: string | null;
  /** Edit, or add access for someone already invited. */
  person?: PersonRow | null;
  onSend?: (body: InviteCreateBody) => Promise<InvitesCreated>;
  onSaveAccess?: (picks: { slug: string; role: InviteWorkspaceRole }[], orgAdmin: boolean) => Promise<unknown>;
  onClose: () => void;
  /** For previews: start on the sent screen. */
  initialResult?: InviteIssued[];
  origin?: string;
  errorMessage?: (err: Error) => string;
}

/** One picker for inviting people and for editing a member's workspaces. */
export function InviteDialog(props: InviteDialogProps) {
  const { mode, workspaces, canInviteOrgAdmins, person, onClose } = props;
  const [emailsText, setEmailsText] = useState(person && mode === "invite" ? person.email : "");
  const [picks, setPicks] = useState<Picks>(() => initialPicks({ person, preselect: props.preselect }));
  const startAdmin = mode === "edit" ? isOrgAdminRole(person?.org_role) : !!person?.invite?.org_admin;
  const [orgAdmin, setOrgAdmin] = useState(startAdmin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteIssued[] | null>(props.initialResult ?? null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = props.origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const owner = person?.org_role === "owner";
  const formError = inviteFormError({ emailsText, picks, orgAdmin, mode });
  const lockedEmail = mode === "edit" || !!person;
  const title = mode === "edit" ? `Access for ${person?.full_name ?? person?.email}` : person ? `Add access for ${person.email}` : "Invite people";

  const submit = async () => {
    if (formError) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = chosenWorkspaces(workspaces, picks);
      if (mode === "edit") {
        await props.onSaveAccess?.(chosen, orgAdmin);
        onClose();
        return;
      }
      const res = await props.onSend!({ emails: parseEmails(emailsText).valid, workspaces: chosen, org_admin: orgAdmin });
      setResult(res.invites);
    } catch (e) {
      const err = e as Error;
      setError(props.errorMessage ? props.errorMessage(err) : err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (issued: InviteIssued) => {
    try {
      await navigator.clipboard.writeText(absoluteInviteUrl(issued.invite_url, origin));
      setCopied(issued.id);
    } catch {
      setError("Couldn't copy. Select the link and copy it.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4" data-testid="invite-dialog">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="font-semibold text-gray-900">{result ? "Invites ready" : title}</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="px-6 pb-5" data-testid="invite-result">
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md mb-4">
              {result.map((i) => (
                <li key={i.id} className="px-3 py-2.5 text-sm" data-testid="invite-result-row" data-sent={i.email_sent ? "1" : "0"}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{i.email}</p>
                      <p className="text-xs text-gray-500 truncate">{accessSummary(i)}</p>
                    </div>
                    <button
                      type="button"
                      data-testid="invite-copy-link"
                      onClick={() => void copy(i)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                    >
                      {copied === i.id ? <Check size={12} /> : <Copy size={12} />} {copied === i.id ? "Copied" : "Copy link"}
                    </button>
                  </div>
                  <p className={`mt-1 text-xs ${i.email_sent ? "text-emerald-700" : "text-amber-700"}`} data-testid="invite-email-status">
                    {i.email_sent ? "✓ " : ""}
                    {emailStatusText(i)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mb-4">Links work for 7 days and only for the invited email.</p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-5">
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="invite-emails">
              {lockedEmail ? "Person" : "Emails"}
            </label>
            {lockedEmail ? (
              <p className="text-sm text-gray-900 mb-4" data-testid="invite-person">{person?.email}</p>
            ) : (
              <textarea
                id="invite-emails"
                data-testid="invite-emails"
                rows={2}
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                placeholder="name@company.com, another@company.com"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-4"
              />
            )}

            {canInviteOrgAdmins && !owner && (
              <label className="flex items-start gap-2 text-sm mb-4 cursor-pointer" data-testid="invite-org-admin">
                <input type="checkbox" className="mt-0.5" checked={orgAdmin} onChange={(e) => setOrgAdmin(e.target.checked)} />
                <span>
                  <span className="font-medium text-gray-900">Make org admin</span>
                  <span className="block text-xs text-gray-500">Manages the org, billing and every workspace. Uses a licence.</span>
                </span>
              </label>
            )}

            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs font-medium text-gray-700">Workspaces</span>
              <span className="text-gray-400 cursor-help" title={ROLE_HELP} data-testid="role-help" aria-label={ROLE_HELP}>
                <Info size={13} />
              </span>
            </div>
            {orgAdmin ? (
              <p className="text-sm text-gray-500 border border-gray-100 rounded-md px-3 py-2.5 mb-4" data-testid="invite-all-workspaces">
                Org admins can open every workspace.
              </p>
            ) : (
              <ul className="border border-gray-100 rounded-md divide-y divide-gray-100 max-h-56 overflow-y-auto mb-4" data-testid="invite-workspaces">
                {workspaces.map((w) => {
                  const role = picks[w.slug];
                  return (
                    <li key={w.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="invite-ws-check"
                          checked={!!role}
                          onChange={(e) => setPicks((p) => ({ ...p, [w.slug]: e.target.checked ? "member" : undefined }))}
                        />
                        <span className="truncate">{w.name}</span>
                      </label>
                      <select
                        aria-label={`Role in ${w.name}`}
                        data-testid="invite-ws-role"
                        disabled={!role}
                        value={role ?? "member"}
                        onChange={(e) => setPicks((p) => ({ ...p, [w.slug]: e.target.value as InviteWorkspaceRole }))}
                        className="border border-gray-200 rounded-md px-2 py-1 text-xs disabled:opacity-40"
                      >
                        {WORKSPACE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </li>
                  );
                })}
                {!workspaces.length && <li className="px-3 py-2 text-sm text-gray-400">No workspaces you can share yet.</li>}
              </ul>
            )}

            {(error || (formError && formError !== "Add at least one email")) && (
              <p className="text-xs text-red-600 mb-3" role="alert" data-testid="invite-error">{error ?? formError}</p>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {mode === "edit" ? "Changes apply at once." : "Each person gets one email with one link. Existing access is never lowered."}
              </p>
              <button
                type="button"
                data-testid="invite-send"
                disabled={!!formError || busy}
                onClick={() => void submit()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {mode === "edit" ? "Save" : "Send invite"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
