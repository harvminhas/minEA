"use client";

import { useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { applyOverrides, runRowAction, type Overrides } from "@/lib/row-saving";
/** Org and workspace members share this shape. */
export interface MemberRow {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: string;
}
import { countOwners, memberActions, type MemberActions } from "@/lib/member-actions";

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

export const REMOVE_CONFIRM_COPY =
  "They lose access to this org and its workspaces. Everything they created stays, and their licence is freed.";

/** Wording for one scope (org or workspace); the table itself is shared. */
export interface MembersScope {
  /** Decides what this row offers. */
  actionsFor: (member: MemberRow, isSelf: boolean) => MemberActions;
  removeLabel: string;
  removeTitle: (name: string) => string;
  removeCopy: string;
  leaveLabel: string;
  leaveTitle: string;
  leaveCopy: string;
}

interface Props {
  members: MemberRow[] | undefined;
  actorEmail: string | null | undefined;
  /** Return the API promise: the row shows Saving…, then Saved, or rolls back with the error. */
  onChangeRole: (userId: string, role: string) => unknown;
  onRemove: (userId: string) => unknown;
  onLeave: () => void;
  busy?: boolean;
  error?: string | null;
  /** Merged People list: access line, Pending badge and Edit / Add to workspace for each member. */
  extra?: (member: MemberRow) => MemberExtra | null;
  /** Rows after the members (people invited but not in the org yet). */
  after?: ReactNode;
  /** Next to the heading (e.g. Invite people). */
  headerAction?: ReactNode;
}

export interface MemberExtra {
  access?: string;
  pending?: boolean;
  actions?: ReactNode;
}

type Pending = { kind: "remove"; member: MemberRow } | { kind: "leave" } | null;

/** Org settings > Members, with per-row actions for owners/admins (API enforces the same rules). */
export function OrgMembersTable(props: Omit<Props, "scope"> & { actorRole: string | null | undefined }) {
  const owners = countOwners(props.members);
  const scope: MembersScope = {
    actionsFor: (m, isSelf) => memberActions({ actorRole: props.actorRole, isSelf, targetRole: m.role, ownerCount: owners }),
    removeLabel: "Remove",
    removeTitle: (name) => `Remove ${name} from the org?`,
    removeCopy: REMOVE_CONFIRM_COPY,
    leaveLabel: "Leave org",
    leaveTitle: "Leave this org?",
    leaveCopy: "You lose access to this org and its workspaces. Everything you created stays.",
  };
  return <MembersTable {...props} scope={scope} />;
}

/** Shared Members table: role dropdown, Remove with confirm, and Leave on your own row. */
export function MembersTable({ members, actorEmail, onChangeRole, onRemove, onLeave, busy, error, scope, extra, after, headerAction }: Props & { scope: MembersScope }) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const me = actorEmail?.toLowerCase() ?? "";
  const rows = applyOverrides(members, (m) => m.user_id, overrides);
  const changeRole = (m: MemberRow, role: string) =>
    void runRowAction(m.user_id, { role }, () => onChangeRole(m.user_id, role), setOverrides);
  const remove = (m: MemberRow) =>
    void runRowAction(m.user_id, { removing: true }, () => onRemove(m.user_id), setOverrides);

  return (
    <div data-testid="org-members-table">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-900">Members</h2>
        {headerAction}
      </div>
      {error && (
        <p className="text-sm text-red-600 mb-2" data-testid="member-action-error">
          {error}
        </p>
      )}
      <div className="divide-y divide-gray-100 mb-4">
        {rows.map((m) => {
          const isSelf = m.email.toLowerCase() === me;
          // Rules use the saved role; the row shows the optimistic one.
          const saved = members?.find((x) => x.user_id === m.user_id) ?? m;
          const a = scope.actionsFor(saved, isSelf);
          const o = overrides[m.user_id];
          const saving = o?.status === "saving";
          const x = extra?.(m) ?? null;
          return (
            <div key={m.user_id} data-testid="member-row" data-status={o?.status ?? "idle"}>
            <div className={`py-2 flex items-center justify-between gap-3 text-sm ${o?.removing ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {m.full_name ?? m.email}
                  {isSelf && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                  {x?.pending && (
                    <span className="ml-2 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-px text-[11px] font-medium text-amber-800" data-testid="pending-badge" title="Has an invite for more access that isn't accepted yet">
                      Pending
                    </span>
                  )}
                </p>
                <p className="text-gray-400 truncate">{m.email}</p>
                {x?.access && <p className="text-xs text-gray-500 truncate" data-testid="member-access">{x.access}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.roles.length > 0 ? (
                  <select
                    aria-label={`Role for ${m.email}`}
                    data-testid="member-role-select"
                    value={m.role}
                    disabled={busy || saving || o?.removing}
                    onChange={(e) => changeRole(m, e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  >
                    {a.roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-gray-500" title={a.reason ?? undefined} data-testid="member-role-label">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                )}
                <RowStatusBadge status={o?.status} removing={!!o?.removing} />
                {!o?.removing && x?.actions}
                {a.canRemove && !o?.removing && (
                  <button
                    type="button"
                    data-testid="member-remove"
                    disabled={busy || saving}
                    onClick={() => setConfirm({ kind: "remove", member: m })}
                    className="text-red-600 hover:text-red-800 text-xs px-1"
                  >
                    {scope.removeLabel}
                  </button>
                )}
                {isSelf && (
                  <button
                    type="button"
                    data-testid="member-leave"
                    disabled={busy || !a.canLeave}
                    title={a.reason ?? undefined}
                    onClick={() => setConfirm({ kind: "leave" })}
                    className="text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed text-xs px-1"
                  >
                    {scope.leaveLabel}
                  </button>
                )}
              </div>
            </div>
            {o?.status === "error" && (
              <p className="text-xs text-red-600 pb-2" role="alert" data-testid="member-row-error">
                {o.error}
              </p>
            )}
            </div>
          );
        })}
        {after}
        {!members && <p className="text-sm text-gray-400 py-2">Loading members…</p>}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" data-testid="member-confirm">
            <h3 className="font-semibold text-gray-900 mb-2">
              {confirm.kind === "remove"
                ? scope.removeTitle(confirm.member.full_name ?? confirm.member.email)
                : scope.leaveTitle}
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              {confirm.kind === "remove" ? scope.removeCopy : scope.leaveCopy}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="member-confirm-ok"
                onClick={() => {
                  if (confirm.kind === "remove") remove(confirm.member);
                  else onLeave();
                  setConfirm(null);
                }}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                {confirm.kind === "remove" ? scope.removeLabel : scope.leaveLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline row state: spinner + "Saving…" (or "Removing…"), then a brief "Saved" tick. */
export function RowStatusBadge({ status, removing }: { status?: string; removing?: boolean }) {
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500" data-testid="row-saving" aria-live="polite">
        <Loader2 size={12} className="animate-spin" /> {removing ? "Removing…" : "Saving…"}
      </span>
    );
  if (status === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600" data-testid="row-saved" aria-live="polite">
        <Check size={12} /> {removing ? "Removed" : "Saved"}
      </span>
    );
  return null;
}
