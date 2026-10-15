"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { platformAdminApi, type AdminUser } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { eraseBlockReason, eraseErrorMessage, ORG_ACTION_LABEL } from "@/lib/platform/erase";
import { cn } from "@/lib/utils";

/** Step 1: preview exactly what goes. Step 2: type the email (and acknowledge any subscription). */
export function EraseUserDialog({ user, onClose, onErased }: { user: AdminUser; onClose: () => void; onErased: (email: string) => void }) {
  const { getToken } = useAuth();
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Several accounts with this email: erase them all by default.
  const [allAccounts, setAllAccounts] = useState(true);
  const preview = useQuery({
    queryKey: ["erase-preview", user.id, allAccounts],
    staleTime: 0,
    queryFn: async () => platformAdminApi.erasePreview(user.id, (await getToken())!, allAccounts),
  });
  const data = preview.data ?? null;
  const reason = eraseBlockReason(data, typed, ack);
  const counts = data?.counts ?? {};

  const erase = async () => {
    setBusy(true);
    setError("");
    try {
      await platformAdminApi.erase(user.id, { confirm_email: typed, acknowledge_subscriptions: ack, all_accounts: allAccounts }, (await getToken())!);
      onErased(user.email);
    } catch (err) {
      setError(eraseErrorMessage(err));
      void preview.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6" role="dialog" aria-modal="true" aria-label={`Erase ${user.email}`}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" data-testid="erase-dialog">
        <h2 className="text-[18px] font-semibold text-[#1c2230]">Erase {user.email}</h2>
        <p className="mt-1 text-[13px] text-[#6b7289]">Permanent. There is no undo. Their sign-in (Firebase) account and any Stripe records are not touched.</p>
        {preview.isLoading && <p className="mt-4 text-[13px] text-[#6b7289]">Working out what would be deleted…</p>}
        {preview.isError && <p className="mt-4 text-[13px] text-[#b42318]">{eraseErrorMessage(preview.error)}</p>}
        {(data?.accounts_with_email ?? user.accounts_with_email ?? 1) > 1 && (
          <div className="mt-4 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] p-3 text-[13px] text-[#3730a3]" data-testid="erase-accounts">
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" checked={allAccounts} onChange={(e) => { setAllAccounts(e.target.checked); setAck(false); }} className="mt-0.5" data-testid="erase-all-accounts" />
              Erase all {data?.accounts_with_email ?? user.accounts_with_email} accounts with this email
            </label>
            <p className="ml-5 text-[12px] text-[#4b5163]">{allAccounts ? "Every account below is checked and erased together, in one go." : "Only the account you clicked is erased; the others stay."}</p>
            {data?.accounts && (
              <ul className="ml-5 mt-1 space-y-0.5 text-[12px] text-[#1c2230]">
                {data.accounts.map((a) => (
                  <li key={a.id} data-account={a.id}>
                    <span className="font-mono">…{a.firebase_uid_hint}</span> · signed up {a.created_at ? new Date(a.created_at).toLocaleDateString("en-CA") : "—"} · {a.orgs.length ? a.orgs.map((o) => `${o.name} (${o.role ?? "workspace only"})`).join(", ") : "no orgs"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {data && (
          <>
            <div className="mt-4 rounded-xl border border-[#eef0f4]">
              <table className="w-full text-left text-[13px]" data-testid="erase-orgs">
                <thead><tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">{["Org", "Their role", "Members", "What happens", "Workspaces", "Objects", "Links"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.orgs.length === 0 && <tr><td colSpan={7} className="px-3 py-2 text-[#8b90a0]">Not in any org.</td></tr>}
                  {data.orgs.map((o) => (
                    <tr key={o.id} className="border-b border-[#f3f4f8] last:border-0" data-action={o.action}>
                      <td className="px-3 py-2 font-medium text-[#1c2230]">{o.name}{o.subscription && <span className="ml-1 rounded bg-[#fff7ed] px-1 text-[11px] text-[#b45309]">Stripe</span>}</td>
                      <td className="px-3 py-2">{o.role ?? "workspace only"}</td>
                      <td className="px-3 py-2">{o.members}</td>
                      <td className={cn("px-3 py-2", o.action === "delete" && "font-semibold text-[#b42318]", o.action === "blocked" && "font-semibold text-[#b45309]")} title={o.reason}>{ORG_ACTION_LABEL[o.action]}</td>
                      <td className="px-3 py-2">{o.action === "delete" ? o.workspaces : "—"}</td>
                      <td className="px-3 py-2">{o.action === "delete" ? o.objects : "—"}</td>
                      <td className="px-3 py-2">{o.action === "delete" ? o.relationships : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-[#4b5163]" data-testid="erase-summary">
              Deletes {counts.orgs_deleted ?? 0} org(s), {counts.workspaces_deleted ?? 0} workspace(s), {counts.objects_deleted ?? 0} object(s) and {counts.relationships_deleted ?? 0} link(s).
              Removes them from {counts.orgs_left ?? 0} shared org(s) without touching anyone else&apos;s data. Also removes {counts.invites ?? 0} invite(s) and {(counts.support_requests ?? 0) + (counts.business_requests ?? 0) + (counts.contact_inquiries ?? 0)} support/contact request(s) with their email.
            </p>
            {data.blockers.length > 0 && (
              <p className="mt-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]" data-testid="erase-blocked">
                <AlertTriangle size={14} className="mr-1 inline" />Can&apos;t erase yet. {data.blockers.join(" ")}
              </p>
            )}
            {data.needs_subscription_ack && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b42318]" data-testid="erase-subscription">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                An org that would be deleted has a Stripe subscription. It will NOT be cancelled. Cancel it in Stripe yourself; tick to erase anyway.
              </label>
            )}
            <label className="mt-4 block text-[13px] text-[#4b5163]">
              Type <span className="font-mono font-semibold text-[#1c2230]">{data.user.email}</span> to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Confirm email" autoComplete="off" spellCheck={false} className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-3 py-2 font-mono text-[13px] outline-none focus:border-[#b42318]" />
            </label>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-[13px] text-[#b42318]">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          {reason && data && <span className="mr-auto text-[12px] text-[#8b90a0]" data-testid="erase-reason">{reason}</span>}
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-[#4b5163]">Cancel</button>
          <button type="button" data-testid="erase-confirm" disabled={Boolean(reason) || busy} onClick={() => void erase()} className="rounded-lg bg-[#b42318] px-3 py-1.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? "Erasing…" : "Erase permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
