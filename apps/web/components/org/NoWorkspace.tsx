import Link from "next/link";
import { Inbox } from "lucide-react";

export interface NoWorkspaceProps {
  orgSlug: string;
  orgName?: string | null;
  /** Org owners/admins can make one. */
  canCreate: boolean;
  /** Workspaces you can open after all (e.g. one was shared while this page was open). */
  workspaces?: { slug: string; name: string; href: string }[];
  /** Your other orgs, to switch to. */
  otherOrgs?: { slug: string; name: string; href: string }[];
}

/** Where you land in an org with no workspace shared with you (it used to be Org settings). */
export function NoWorkspace({ orgSlug, orgName, canCreate, workspaces = [], otherOrgs = [] }: NoWorkspaceProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" data-testid="no-workspace">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <Inbox size={20} />
        </div>
        {workspaces.length ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Workspaces in {orgName ?? orgSlug}</h1>
            <ul className="text-sm space-y-1.5 mb-2">
              {workspaces.map((w) => (
                <li key={w.slug}>
                  <Link href={w.href} className="text-indigo-600 font-medium hover:text-indigo-800">Open {w.name} →</Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">No workspace shared with you yet</h1>
            <p className="text-sm text-gray-600 mb-5">
              You&apos;re in {orgName ?? "this org"}, but no one has added you to a workspace. Ask a workspace admin to
              add you; it shows up here as soon as they do.
            </p>
            {canCreate && (
              <Link
                href={`/orgs/${orgSlug}/workspaces/new`}
                data-testid="no-workspace-create"
                className="inline-flex bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-4 py-2 text-sm font-medium"
              >
                Create a workspace
              </Link>
            )}
          </>
        )}
        {otherOrgs.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4 text-left" data-testid="no-workspace-orgs">
            <p className="text-xs font-medium text-gray-500 mb-2">Switch org</p>
            <ul className="space-y-1">
              {otherOrgs.map((o) => (
                <li key={o.slug}>
                  <Link href={o.href} className="block rounded-md px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50">{o.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
