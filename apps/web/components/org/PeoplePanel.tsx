"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PersonRow } from "@minea/types";
import { orgsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { InviteDialog } from "@/components/org/InviteDialog";
import { PendingInviteRow } from "@/components/org/PendingInviteRow";
import type { MemberExtra, MemberRow } from "@/components/org/OrgMembersTable";
import { absoluteInviteUrl, accessSummary, isOrgAdminRole, pendingOnlyRows, personByEmail } from "@/lib/invite-form";

type Dialog = { mode: "invite" | "edit"; person?: PersonRow | null } | null;

export const PEOPLE_QUERY = "people";

/**
 * The merged Members list's invite pieces, for Org settings and a workspace's settings:
 * one row per person (members, then people still invited), Pending badge, Copy link,
 * Resend invite, Add to workspace / Edit, and the single invite picker.
 */
export function usePeoplePanel(opts: {
  orgSlug: string;
  /** On a workspace's settings: preselect it and list only its invitees. */
  workspaceSlug?: string;
  enabled: boolean;
  emailVerified: boolean;
  /** Plan doesn't allow invites: the button is replaced by this. */
  blocked?: ReactNode;
  errorMessage?: (err: Error) => string;
  onChanged?: () => void;
}): {
  extra: (m: MemberRow) => MemberExtra | null;
  after: ReactNode;
  headerAction: ReactNode;
  dialog: ReactNode;
  pendingCount: number;
} {
  const { orgSlug, workspaceSlug, enabled } = opts;
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const tok = async () => (await getToken())!;

  const { data } = useQuery({
    queryKey: [PEOPLE_QUERY, orgSlug],
    queryFn: async () => orgsApi.people(orgSlug, await tok()),
    enabled,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [PEOPLE_QUERY, orgSlug] });
    opts.onChanged?.();
  };
  const workspaces = data?.workspaces ?? [];
  const canAdd = workspaces.length > 0 || !!data?.can_invite_org_admins;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const pendingRows = pendingOnlyRows(data?.people, workspaceSlug);
  const rowFor = (p: PersonRow) => (
    <PendingInviteRow
      key={p.invite!.id}
      invite={{
        id: p.invite!.id,
        email: p.email,
        role: p.invite!.org_admin ? "admin" : (p.invite!.workspaces[0]?.role ?? "member"),
        expires_at: p.invite!.expires_at,
        access: accessSummary(p.invite),
        canCopy: p.invite!.can_copy,
      }}
      onCopyLink={async (id) => absoluteInviteUrl((await orgsApi.inviteLink(orgSlug, id, await tok())).invite_url, origin)}
      onResend={async (id) => {
        const r = await orgsApi.resendInvite(orgSlug, id, await tok());
        refresh();
        return { url: absoluteInviteUrl(r.invite_url, origin), emailSent: r.email_sent };
      }}
      onRevoke={async (id) => {
        await orgsApi.revokeInvite(orgSlug, id, await tok());
        refresh();
      }}
      onAddAccess={p.invite!.can_manage && canAdd && !p.invite!.org_admin ? () => setDialog({ mode: "invite", person: p }) : undefined}
    />
  );

  const extra = (m: MemberRow): MemberExtra | null => {
    const p = personByEmail(data?.people, m.email);
    if (!p) return null;
    const orgAdmin = isOrgAdminRole(p.org_role);
    const editable = canAdd && !orgAdmin;
    return {
      access: accessSummary({ org_admin: orgAdmin, workspaces: p.workspaces }),
      pending: !!p.invite,
      actions:
        editable || (orgAdmin && data?.can_invite_org_admins && p.org_role !== "owner") ? (
          <button
            type="button"
            data-testid="member-edit-access"
            onClick={() => setDialog({ mode: "edit", person: p })}
            className="text-indigo-600 hover:text-indigo-800 text-xs px-1"
          >
            {p.workspaces.length || orgAdmin ? "Edit" : "Add to workspace"}
          </button>
        ) : null,
    };
  };

  const headerAction =
    opts.blocked ??
    (canAdd ? (
      <button
        type="button"
        data-testid="invite-open"
        disabled={!opts.emailVerified}
        title={opts.emailVerified ? undefined : "Verify your email before inviting others"}
        onClick={() => setDialog({ mode: "invite" })}
        className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm disabled:opacity-50"
      >
        Invite people
      </button>
    ) : null);

  const person = dialog?.person;
  const node = dialog ? (
    <InviteDialog
      key={`${dialog.mode}-${person?.email ?? "new"}`}
      mode={dialog.mode}
      person={person}
      workspaces={workspaces}
      canInviteOrgAdmins={!!data?.can_invite_org_admins}
      preselect={workspaceSlug}
      errorMessage={opts.errorMessage}
      onClose={() => setDialog(null)}
      onSend={async (body) => {
        const res = await orgsApi.createInvite(orgSlug, body, await tok());
        refresh();
        return res;
      }}
      onSaveAccess={async (picks, orgAdmin) => {
        const token = await tok();
        const wasAdmin = isOrgAdminRole(person?.org_role);
        if (person?.user_id && orgAdmin !== wasAdmin) {
          await orgsApi.changeMemberRole(orgSlug, person.user_id, orgAdmin ? "admin" : "member", token);
        }
        if (person?.user_id && !orgAdmin) await orgsApi.setMemberWorkspaces(orgSlug, person.user_id, picks, token);
        refresh();
      }}
    />
  ) : null;

  return {
    extra,
    after: <>{pendingRows.map(rowFor)}</>,
    headerAction,
    dialog: node,
    pendingCount: (data?.people ?? []).filter((p) => p.invite).length,
  };
}
