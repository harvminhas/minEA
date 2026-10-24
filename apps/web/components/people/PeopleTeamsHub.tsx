"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useOwnershipData } from "@/components/mvp/OwnersPage";
import { CreateTeamPanel } from "@/components/people/CreateTeamPanel";
import { OwnershipRolesView } from "@/components/people/OwnershipRolesView";
import { PersonDetailPanel } from "@/components/people/PersonDetailPanel";
import { TeamDetailPanel } from "@/components/people/TeamDetailPanel";
import { useRefreshPeople } from "@/components/people/usePeople";
import { ownedBy } from "@/lib/ownership";
import { matchPeople, memberCount, personOwns, teamsOf } from "@/lib/people";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type PeopleTab = "people" | "teams" | "roles";

const input = "rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#1c2230] outline-none focus:border-[#c9c3f7]";
const th = "px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8b90a0]";

/** People & teams: the one place a person or team lives, with People / Teams / Ownership roles tabs. */
export function PeopleTeamsHub({ tab }: { tab: PeopleTab }) {
  const { basePath } = useTenancy();
  const data = useOwnershipData();
  const tabs: { key: PeopleTab; label: string; href: string }[] = [
    { key: "people", label: `People (${data.contacts.length})`, href: `${basePath}/people/contacts` },
    { key: "teams", label: `Teams (${data.teams.length})`, href: `${basePath}/people/teams` },
    { key: "roles", label: "Ownership roles", href: `${basePath}/people/roles` },
  ];
  return (
    <div className="px-6 py-5 text-[#1c2230]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">People &amp; teams</h1>
        <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium", data.unowned ? "bg-amber-50 text-amber-700" : "bg-[#f4f5f8] text-[#8b90a0]")}>
          {data.unowned} unowned
        </span>
      </div>
      <nav className="mb-4 flex gap-5 border-b border-[#e6e8ee] text-[13px]">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn("-mb-px border-b-2 pb-2 font-medium", tab === t.key ? "border-[#5b4ce6] text-[#1c2230]" : "border-transparent text-[#8b90a0]")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "people" && <PeopleList data={data} />}
      {tab === "teams" && <TeamsList data={data} />}
      {tab === "roles" && <OwnershipRolesView data={data} />}
    </div>
  );
}

type Data = ReturnType<typeof useOwnershipData>;

function PeopleList({ data }: { data: Data }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const refresh = useRefreshPeople();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", title: "" });
  const rows = matchPeople(data.contacts, q, 10_000);

  const create = async () => {
    try {
      const made = await peopleApi.createContact(
        orgSlug!,
        workspaceSlug!,
        { name: draft.name.trim(), email: draft.email.trim() || null, title: draft.title.trim() || null },
        (await getToken())!,
      );
      refresh();
      setDraft({ name: "", email: "", title: "" });
      setAdding(false);
      setOpen(made.id);
    } catch (e) {
      toast({ title: "Could not add person", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <label className="relative">
          <Search size={13} className="absolute left-2 top-2.5 text-[#8b90a0]" />
          <input aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className={cn(input, "w-[260px] pl-7")} />
        </label>
        <button type="button" onClick={() => setAdding(true)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white">
          <Plus size={14} /> New person
        </button>
      </div>
      {adding && (
        <form
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#c9c3f7] bg-[#fafaff] px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.name.trim()) void create();
          }}
        >
          <input aria-label="Name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" className={input} />
          <input aria-label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (optional)" className={input} />
          <input aria-label="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email (optional)" className={input} />
          <button type="submit" disabled={!draft.name.trim()} className="rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-[#8b90a0]">Cancel</button>
        </form>
      )}
      {data.contacts.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-[#d6d9e2] px-6 py-12 text-center text-[13px] text-[#5b6170]">
          <p className="mb-1 text-[15px] font-semibold text-[#1c2230]">No people yet</p>
          <p>Add the people who own and run your systems. You can also type a new name in any owner, lead or member field.</p>
          <button type="button" onClick={() => setAdding(true)} className="mt-4 rounded-md bg-[#5b4ce6] px-3 py-1.5 font-medium text-white">
            + New person
          </button>
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-xl border border-[#e6e8ee] text-[13px]">
          <thead className="bg-[#fafbfc]">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Title</th>
              <th className={th}>Email</th>
              <th className={th}>Teams</th>
              <th className={cn(th, "text-right")}>Owns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f1f5]">
            {rows.map((p) => {
              const { direct, viaTeam } = personOwns(data.items, p.id);
              const owns = direct.length + viaTeam.length;
              return (
                <tr key={p.id} onClick={() => setOpen(p.id)} className="cursor-pointer hover:bg-[#fafbfc]">
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-[#5b6170]">{p.title || <span className="text-[#b4b8c4]">—</span>}</td>
                  <td className="px-4 py-2.5 text-[#5b6170]">{p.email || <span className="text-[#b4b8c4]">—</span>}</td>
                  <td className="px-4 py-2.5 text-[#5b6170]">{teamsOf(p).map((t) => t.name).join(", ") || <span className="text-[#b4b8c4]">—</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    {owns ? `${owns}` : <span className="rounded-full bg-[#f4f5f8] px-2 py-0.5 text-[11px] text-[#8b90a0]">Owns nothing</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[#8b90a0]">No one matches “{q}”.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {open && <PersonDetailPanel contactId={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function TeamsList({ data }: { data: Data }) {
  const refresh = useRefreshPeople();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const leadName = (id?: string | null, legacy?: string | null) => data.contacts.find((c) => c.id === id)?.name ?? legacy ?? "";
  return (
    <>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white">
          <Plus size={14} /> New team
        </button>
      </div>
      {data.teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d6d9e2] px-6 py-12 text-center text-[13px] text-[#5b6170]">
          <p className="mb-1 text-[15px] font-semibold text-[#1c2230]">No teams yet</p>
          <p>Create a team, pick its lead and add members. No roles to set up first.</p>
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-xl border border-[#e6e8ee] text-[13px]">
          <thead className="bg-[#fafbfc]">
            <tr>
              <th className={th}>Team</th>
              <th className={th}>Lead</th>
              <th className={th}>Members</th>
              <th className={cn(th, "text-right")}>Owns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f1f5]">
            {data.teams.map((t) => {
              const owns = ownedBy(data.items, { type: "team", id: t.id }).length;
              const members = t.member_count ?? memberCount(data.contacts, t.id);
              return (
                <tr key={t.id} onClick={() => setOpen(t.id)} className="cursor-pointer hover:bg-[#fafbfc]">
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-4 py-2.5 text-[#5b6170]">{leadName(t.lead_contact_id, t.lead_name) || <span className="text-[#b4b8c4]">No lead</span>}</td>
                  <td className="px-4 py-2.5 text-[#5b6170]">{members}</td>
                  <td className="px-4 py-2.5 text-right">
                    {owns ? `${owns}` : <span className="rounded-full bg-[#f4f5f8] px-2 py-0.5 text-[11px] text-[#8b90a0]">Owns nothing</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {creating && (
        <CreateTeamPanel
          onClose={() => setCreating(false)}
          onSuccess={(id) => {
            setCreating(false);
            refresh();
            setOpen(id);
          }}
        />
      )}
      {open && <TeamDetailPanel teamId={open} onClose={() => setOpen(null)} onUpdate={refresh} />}
    </>
  );
}
