"use client";

import { useState } from "react";
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
  onChangeRole: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
  onLeave: () => void;
  busy?: boolean;
  error?: string | null;
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
export function MembersTable({ members, actorEmail, onChangeRole, onRemove, onLeave, busy, error, scope }: Props & { scope: MembersScope }) {
  const [confirm, setConfirm] = useState<Pending>(null);
  const me = actorEmail?.toLowerCase() ?? "";

  return (
    <div data-testid="org-members-table">
      <h2 className="font-semibold text-gray-900 mb-4">Members</h2>
      {error && (
        <p className="text-sm text-red-600 mb-2" data-testid="member-action-error">
          {error}
        </p>
      )}
      <div className="divide-y divide-gray-100 mb-4">
        {(members ?? []).map((m) => {
          const isSelf = m.email.toLowerCase() === me;
          const a = scope.actionsFor(m, isSelf);
          return (
            <div key={m.user_id} className="py-2 flex items-center justify-between gap-3 text-sm" data-testid="member-row">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {m.full_name ?? m.email}
                  {isSelf && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                </p>
                <p className="text-gray-400 truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.roles.length > 0 ? (
                  <select
                    aria-label={`Role for ${m.email}`}
                    data-testid="member-role-select"
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => onChangeRole(m.user_id, e.target.value)}
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
                {a.canRemove && (
                  <button
                    type="button"
                    data-testid="member-remove"
                    disabled={busy}
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
          );
        })}
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
                  if (confirm.kind === "remove") onRemove(confirm.member.user_id);
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
