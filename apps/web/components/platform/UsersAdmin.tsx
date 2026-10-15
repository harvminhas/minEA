"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformAdminApi, type AdminUser } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { EraseUserDialog } from "@/components/platform/EraseUserDialog";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—");

export function UsersAdmin() {
  const { getToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [erasing, setErasing] = useState<AdminUser | null>(null);
  const [notice, setNotice] = useState("");
  const users = useQuery({
    queryKey: ["platform-users", q, sort],
    queryFn: async () => platformAdminApi.users(q, sort, (await getToken())!),
  });
  const rows = users.data?.users ?? [];
  const me = (user?.email ?? "").toLowerCase();

  return (
    <main className="p-6" data-testid="users-admin">
      <h1 className="text-[22px] font-semibold text-[#1c2230]">Users <span className="text-[14px] font-normal text-[#8b90a0]">{rows.length}</span></h1>
      <p className="text-[13px] text-[#6b7289]">Everyone who has signed up. Erase permanently removes a person and the orgs only they belong to.</p>
      {notice && <p className="mt-3 rounded-lg bg-[#ecfdf5] px-3 py-2 text-[13px] text-[#047857]" data-testid="erase-notice">{notice}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" aria-label="Search users" className="h-9 w-[280px] rounded-lg border border-[#e6e8ee] px-3 text-[13px] outline-none focus:border-[#5b4ce6]" />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "oldest")} className="h-9 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
          <option value="newest">Newest sign-ups first</option>
          <option value="oldest">Oldest sign-ups first</option>
        </select>
      </div>
      {users.isError && <p className="mt-3 text-[13px] text-[#b42318]">{(users.error as Error).message}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Email", "Name", "Signed up", "Last active", "Orgs · role · plan", "Objects", ""].map((h) => <th key={h} className="h-10 px-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#f3f4f8] align-top" data-user={row.email}>
                <td className="px-2 py-2.5 font-medium text-[#1c2230]">{row.email}{!row.verified && <span className="ml-1 text-[11px] text-[#b45309]">unverified</span>}</td>
                <td className="px-2 py-2.5">{row.name || <span className="text-[#c5c8d4]">—</span>}</td>
                <td className="whitespace-nowrap px-2 py-2.5">{day(row.created_at)}</td>
                <td className="whitespace-nowrap px-2 py-2.5" title="Last change they made in any workspace">{day(row.last_active)}</td>
                <td className="px-2 py-2.5">
                  {row.orgs.length === 0 ? <span className="text-[#c5c8d4]">No org</span> : row.orgs.map((o) => (
                    <div key={o.slug} className="text-[12px]">
                      <span className="font-medium text-[#1c2230]">{o.name}</span> · {o.role} · {o.plan}{o.subscription ? " (Stripe)" : ""} · {o.members} member{o.members === 1 ? "" : "s"} · {o.objects} objects
                    </div>
                  ))}
                </td>
                <td className="px-2 py-2.5" title="Records they created">{row.objects_created}</td>
                <td className="px-2 py-2.5 text-right">
                  {row.email.toLowerCase() !== me && (
                    <button type="button" data-erase={row.email} onClick={() => setErasing(row)} className="rounded-md border border-[#fecaca] px-2 py-1 text-[12px] font-medium text-[#b42318] hover:bg-[#fef2f2]">
                      Erase…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erasing && (
        <EraseUserDialog
          user={erasing}
          onClose={() => setErasing(null)}
          onErased={(email) => {
            setErasing(null);
            setNotice(`${email} was erased.`);
            void queryClient.invalidateQueries({ queryKey: ["platform-users"] });
          }}
        />
      )}
    </main>
  );
}
