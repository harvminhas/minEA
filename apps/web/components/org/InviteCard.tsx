import type { ReactNode } from "react";
import type { InvitePreview } from "@minea/types";

const ROLE: Record<string, string> = { admin: "Admin", member: "Member", viewer: "Viewer" };

/** Invite page body: who invited you, to which workspaces and roles; or "you're already in". */
export function InviteCard({
  preview,
  already,
  children,
}: {
  preview: InvitePreview;
  /** Accepted before (or you already had this access): no error, just a way in. */
  already?: { href: string; label: string } | null;
  children?: ReactNode;
}) {
  const ws = preview.workspaces ?? [];
  return (
    <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-sm" data-testid="invite-card">
      {already ? (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re already in {preview.org_name}</h1>
          <p className="text-sm text-gray-600 mb-5" data-testid="invite-already">
            This invite was already accepted for {preview.email}. Nothing else to do.
          </p>
          <a href={already.href} className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-md py-2.5 text-sm font-medium">
            {already.label}
          </a>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Join {preview.org_name}</h1>
          <p className="text-sm text-gray-600 mb-4">
            {preview.inviter ? <><strong>{preview.inviter}</strong> invited </> : "Invite for "}
            {preview.inviter ? preview.email : <strong>{preview.email}</strong>}.
          </p>
          <div className="rounded-md border border-gray-100 mb-4" data-testid="invite-access">
            <p className="px-3 pt-2.5 pb-1 text-xs font-medium text-gray-500">Your access</p>
            <ul className="divide-y divide-gray-50 text-sm">
              {preview.org_admin ? (
                <li className="flex justify-between px-3 py-2"><span>All workspaces</span><span className="text-gray-500">Org admin</span></li>
              ) : ws.length ? (
                ws.map((w) => (
                  <li key={w.slug} className="flex justify-between px-3 py-2">
                    <span>{w.name}</span>
                    <span className="text-gray-500">{ROLE[w.role] ?? w.role}</span>
                  </li>
                ))
              ) : (
                <li className="flex justify-between px-3 py-2">
                  <span>{preview.workspace_slug ?? "Org"}</span>
                  <span className="text-gray-500 capitalize">{preview.role}</span>
                </li>
              )}
            </ul>
          </div>
          {preview.consumed && <p className="text-sm text-gray-600 mb-4">This invite was already accepted. Continue to open {preview.org_name}.</p>}
          {preview.expired && <p className="text-sm text-red-600 mb-4">This invite has expired. Ask for a new one.</p>}
          {children}
        </>
      )}
    </div>
  );
}
