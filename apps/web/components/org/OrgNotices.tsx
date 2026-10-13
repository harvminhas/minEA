"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { roleLabel } from "@/lib/org-access";

/** Org settings opened by a member or viewer: explain instead of redirecting. */
export function NotOrgAdmin({
  orgName,
  role,
  askHref,
  adminOrgs,
}: {
  orgName: string;
  role: string;
  askHref: string | null;
  adminOrgs: { slug: string; name: string; role: string }[];
}) {
  return (
    <div className="p-8 max-w-xl mx-auto" data-testid="not-org-admin">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Lock size={16} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">You&apos;re not an admin of {orgName}</h1>
            <p className="mt-1 text-sm text-gray-600">
              Only owners and admins can open org settings. Your role in {orgName} is{" "}
              <span data-testid="not-org-admin-role" className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {roleLabel(role)}
              </span>
              . Ask an owner or admin if you need something changed.
            </p>
            <p className="mt-2 text-xs text-gray-500" data-testid="not-org-admin-ws-hint">
              Being an admin of a workspace doesn&apos;t make you an org admin; workspace admins manage
              their workspace from its Workspace settings. If you were just made an org admin, this page
              updates on its own.
            </p>
          </div>
        </div>
        {askHref && (
          <Link
            href={askHref}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <ArrowLeft size={14} /> Back to {orgName}
          </Link>
        )}
        {adminOrgs.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4" data-testid="not-org-admin-other-orgs">
            <p className="text-sm font-medium text-gray-700">Orgs you can manage</p>
            <ul className="mt-2 space-y-1.5">
              {adminOrgs.map((o) => (
                <li key={o.slug} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/orgs/${o.slug}/settings`} className="font-medium text-indigo-600 hover:underline">
                    Org settings · {o.name}
                  </Link>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{roleLabel(o.role)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** The org couldn't be loaded: say so, offer a retry, never jump to another org. */
export function OrgLoadError({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="p-8 max-w-xl mx-auto" data-testid="org-load-error">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3 text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <h1 className="font-semibold">Couldn&apos;t open this organisation</h1>
            <p className="mt-1 text-sm">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-70"
          >
            <RefreshCw size={14} className={retrying ? "animate-spin" : ""} /> Try again
          </button>
          <Link href="/home" className="text-sm font-medium text-amber-900 underline">
            Go to my organisations
          </Link>
        </div>
      </div>
    </div>
  );
}
