/**
 * Licences = people with editing rights, derived from the EXISTING role model.
 *   org owner / org admin            → hold a licence (admins edit every workspace)
 *   org member + workspace admin/member in any workspace → editor, holds a licence
 *   org member with only viewer roles → viewer, free
 *   org member with no workspace role → no workspace access, free
 * No new tables. Display only.
 */

export type LicenceStatus = "owner" | "admin" | "editor" | "viewer" | "no_access";

const ORDER: LicenceStatus[] = ["owner", "admin", "editor", "viewer", "no_access"];

export const LICENCE_STATUS_LABELS: Record<LicenceStatus, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
  no_access: "No workspace access",
};

export function licenceStatusFor(orgRole: string, workspaceRoles: string[]): LicenceStatus {
  if (orgRole === "owner") return "owner";
  if (orgRole === "admin") return "admin";
  if (workspaceRoles.some((r) => r === "admin" || r === "member" || r === "editor")) return "editor";
  if (workspaceRoles.includes("viewer")) return "viewer";
  return "no_access";
}

export function holdsLicence(status: LicenceStatus): boolean {
  return status === "owner" || status === "admin" || status === "editor";
}

export interface RosterMember {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export interface RosterRow {
  userId: string;
  name: string;
  email: string;
  orgRole: string;
  workspaces: { slug: string; name: string; role: string }[];
  status: LicenceStatus;
  hasLicence: boolean;
}

export function buildLicenceRoster(
  orgMembers: RosterMember[],
  workspaceMembers: { slug: string; name: string; members: { user_id: string; role: string }[] }[]
): RosterRow[] {
  const rows = orgMembers.map((m) => {
    const workspaces = workspaceMembers.flatMap((ws) =>
      ws.members
        .filter((wm) => wm.user_id === m.user_id)
        .map((wm) => ({ slug: ws.slug, name: ws.name, role: wm.role }))
    );
    const status = licenceStatusFor(
      m.role,
      workspaces.map((w) => w.role)
    );
    return {
      userId: m.user_id,
      name: m.full_name || m.email,
      email: m.email,
      orgRole: m.role,
      workspaces,
      status,
      hasLicence: holdsLicence(status),
    };
  });
  return rows.sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name)
  );
}

export interface LicenceSummary {
  used: number;
  /** null = no pack cap (legacy limits unchanged) */
  total: number | null;
  available: number | null;
  atCap: boolean;
  overCap: boolean;
}

export function summarizeLicences(usedCount: number, total: number | null): LicenceSummary {
  const used = Math.max(0, usedCount);
  if (total == null) return { used, total: null, available: null, atCap: false, overCap: false };
  return {
    used,
    total,
    available: Math.max(0, total - used),
    atCap: used >= total,
    overCap: used > total,
  };
}

export function licencesUsedLabel(summary: LicenceSummary): string {
  if (summary.total == null) {
    return `${summary.used} licence${summary.used === 1 ? "" : "s"} in use`;
  }
  return `${summary.used} of ${summary.total} licence${summary.total === 1 ? "" : "s"} used`;
}

/** Whether one more licence can be assigned under the pack size. */
export function canAssignLicence(summary: LicenceSummary): boolean {
  if (summary.total == null) return true;
  return summary.used < summary.total;
}
