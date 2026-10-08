"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import {
  LICENCE_STATUS_LABELS,
  canAssignLicence,
  licencesUsedLabel,
  workspaceRoleLabel,
  type LicenceSummary,
  type RosterRow,
} from "@/lib/billing/licences";
import { CATALOG, entitlementsFor, nextPackWithRoom, type DisplayPlanId } from "@/lib/billing/plans";

interface Props {
  rows: RosterRow[] | null;
  error: string | null;
  summary: LicenceSummary | null;
  /** null while billing status loads; summary is null then too. */
  displayPlan: DisplayPlanId | null;
  billingHref: string;
  pendingInvites: number;
}

/**
 * Licences tab. READ-ONLY: the existing role-change API only switches org admin/member and
 * there is no API to change a workspace role to viewer, so nothing here changes access.
 */
export function LicencesPanel({ rows, error, summary, displayPlan, billingHref, pendingInvites }: Props) {
  const plan = entitlementsFor(displayPlan ?? "free");
  const canAssign = summary ? canAssignLicence(summary) : false;
  const next =
    summary && summary.total != null && displayPlan ? nextPackWithRoom(summary.used + 1, displayPlan) : null;

  return (
    <div data-testid="licences-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-semibold text-gray-900">Licences</h2>
        <p className="text-sm font-medium text-gray-900" data-testid="licences-count">
          {summary ? licencesUsedLabel(summary) : "Loading…"}
          {summary?.total == null && summary && (
            <span className="font-normal text-gray-500"> · current limits unchanged</span>
          )}
        </p>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        A licence is for someone who edits: the owner, admins and workspace editors. Viewers are
        free and unlimited.
      </p>

      <div className="mb-4 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <p>
          This list is read-only for now. Assigning and removing licences here will come with
          checkout. Today, someone gets a licence when they are invited as an admin or as a
          workspace editor, and invited viewers stay free.
        </p>
      </div>

      {summary?.atCap && summary.total != null && (
        <div
          data-testid="licence-cap-prompt"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {summary.overCap
            ? `${summary.used} people have editing rights, but ${plan.label} includes ${summary.total}. Nobody loses access; free up licences or move to a bigger pack.`
            : displayPlan === "free"
              ? "Free includes 1 editor, and it's in use."
              : summary.total === 1
                ? `The 1 licence on ${plan.label} is in use.`
                : `All ${summary.total} licences on ${plan.label} are in use.`}{" "}
          {next ? (
            <Link href={billingHref} className="font-medium text-indigo-700 hover:text-indigo-800">
              Upgrade to {CATALOG[next].label} for {CATALOG[next].licences} licences →
            </Link>
          ) : (
            <span>Business is the largest pack (10 licences).</span>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3">Could not load licences: {error}</p>}

      <div className="divide-y divide-gray-100 mb-2">
        {(rows ?? []).map((row) => (
          <div key={row.userId} className="py-2 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{row.name}</p>
              <p className="text-gray-400 truncate">
                {row.email}
                {row.workspaces.length > 0 && (
                  <span>
                    {" · "}
                    {row.workspaces.map((w) => `${w.name}: ${workspaceRoleLabel(w.role)}`).join(", ")}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-gray-500">{LICENCE_STATUS_LABELS[row.status]}</span>
              {row.hasLicence ? (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {row.status === "owner" ? "Licence · always" : "Licence"}
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    Free
                  </span>
                  <button
                    type="button"
                    disabled
                    title={
                      canAssign
                        ? "Licence assignment is read-only for now"
                        : "All licences are in use. Upgrade to add more."
                    }
                    className="cursor-not-allowed rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-400"
                  >
                    Assign licence
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {!rows && !error && <p className="text-sm text-gray-400 py-2">Loading members…</p>}
      </div>
      {pendingInvites > 0 && (
        <p className="text-xs text-gray-400 mb-2">
          {pendingInvites} pending invite{pendingInvites === 1 ? "" : "s"} (counted once accepted).
        </p>
      )}
    </div>
  );
}
