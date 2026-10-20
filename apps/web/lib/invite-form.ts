import type { InviteAccess, InviteIssued, InviteWorkspaceRole, PersonRow } from "@minea/types";

/** Shown as a tooltip next to the role pickers (it used to be a help line under the form). */
export const ROLE_HELP =
  "Admin: manages the workspace and its members. Member: adds and edits content. Viewer: reads only, and is free. Admins and members use a licence.";

export const WORKSPACE_ROLES: { value: InviteWorkspaceRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const RANK: Record<string, number> = { viewer: 1, member: 2, admin: 3 };
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export const MAX_INVITE_EMAILS = 50;

/** Split pasted text into emails (commas, semicolons, spaces or new lines); dedupe, keep order. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL.test(e)) {
      if (!invalid.includes(raw.trim())) invalid.push(raw.trim());
    } else if (!valid.includes(e)) valid.push(e);
  }
  return { valid, invalid };
}

export type Picks = Record<string, InviteWorkspaceRole | undefined>;

/** Chosen workspaces in picker order. */
export function chosenWorkspaces(order: { slug: string }[], picks: Picks): { slug: string; role: InviteWorkspaceRole }[] {
  return order.flatMap((w) => (picks[w.slug] ? [{ slug: w.slug, role: picks[w.slug]! }] : []));
}

/** Why Send is disabled, or null when the form is ready. */
export function inviteFormError(opts: {
  emailsText: string;
  picks: Picks;
  orgAdmin: boolean;
  mode?: "invite" | "edit";
}): string | null {
  const anyWs = Object.values(opts.picks).some(Boolean);
  if (opts.mode !== "edit") {
    const { valid, invalid } = parseEmails(opts.emailsText);
    if (invalid.length) return `Check ${invalid.length === 1 ? "this email" : "these emails"}: ${invalid.join(", ")}`;
    if (!valid.length) return "Add at least one email";
    if (valid.length > MAX_INVITE_EMAILS) return `Up to ${MAX_INVITE_EMAILS} emails at a time`;
  }
  if (!anyWs && !opts.orgAdmin) return "Pick at least one workspace";
  return null;
}

/** The higher of two roles; access is never lowered by a second invite. */
export function higherRole(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a;
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", member: "Member", viewer: "Viewer" };

/** "Main · Member, EMEA · Viewer" or "Org admin · all workspaces". */
export function accessSummary(access: { org_admin?: boolean; workspaces: InviteAccess[] } | null | undefined): string {
  if (!access) return "";
  if (access.org_admin) return "Org admin · all workspaces";
  if (!access.workspaces.length) return "No workspaces yet";
  return access.workspaces.map((w) => `${w.name} · ${ROLE_LABEL[w.role] ?? w.role}`).join(", ");
}

export function isOrgAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** The picker's starting state when editing a member, or when opened from one workspace. */
export function initialPicks(opts: { person?: PersonRow | null; preselect?: string | null }): Picks {
  const picks: Picks = {};
  for (const w of opts.person?.workspaces ?? []) picks[w.slug] = w.role;
  for (const w of opts.person?.invite?.workspaces ?? []) {
    picks[w.slug] = higherRole(picks[w.slug], w.role) as InviteWorkspaceRole;
  }
  if (opts.preselect && !picks[opts.preselect]) picks[opts.preselect] = "member";
  return picks;
}

/** Result line for one email after Send. */
export function emailStatusText(issued: Pick<InviteIssued, "email_sent" | "merged">): string {
  if (!issued.email_sent) return "Email didn't send — copy the link instead";
  return issued.merged ? "Invite updated and emailed" : "Invite emailed";
}

export function absoluteInviteUrl(path: string, origin: string): string {
  return /^https?:\/\//.test(path) ? path : `${origin}${path}`;
}

export function noWorkspacePath(orgSlug: string): string {
  return `/orgs/${orgSlug}/no-workspace`;
}

/** Rows that aren't org members yet (invitees); members with an invite show on their own row. */
export function pendingOnlyRows(people: PersonRow[] | undefined, workspaceSlug?: string): PersonRow[] {
  return (people ?? []).filter(
    (p) =>
      !p.org_role &&
      p.invite &&
      (!workspaceSlug || p.invite.org_admin || p.invite.workspaces.some((w) => w.slug === workspaceSlug))
  );
}

export function personByEmail(people: PersonRow[] | undefined, email: string): PersonRow | undefined {
  const e = email.toLowerCase();
  return people?.find((p) => p.email.toLowerCase() === e);
}
