"use client";

import { useState } from "react";
import type { PeopleContact, Team } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { DetailPanelCloseButton } from "@/components/ui/DetailPanel";
import { PersonPicker } from "@/components/people/PersonPicker";
import { useRefreshPeople, useResolvePerson } from "@/components/people/usePeople";
import { handoverSummary, type PersonOwnedRow } from "@/lib/people";
import { toast } from "@/hooks/use-toast";

/** Someone is leaving: move the records they are named on, pick a new lead for each team they lead. */
export function LeavingDialog({
  person,
  direct,
  ledTeams,
  teams,
  people,
  onClose,
}: {
  person: PeopleContact;
  direct: PersonOwnedRow[];
  ledTeams: Team[];
  teams: { id: string; name: string }[];
  people: PeopleContact[];
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const resolve = useResolvePerson();
  const refresh = useRefreshPeople();
  const [to, setTo] = useState<string | null>(null);
  const [leads, setLeads] = useState<Record<string, string | null>>({});
  const [leaveTeams, setLeaveTeams] = useState(true);
  const [busy, setBusy] = useState(false);
  const others = people.filter((p) => p.id !== person.id);
  const first = person.name.split(" ")[0];

  const pick = async (choice: Parameters<typeof resolve>[0], set: (id: string | null) => void) => {
    try {
      set(await resolve(choice));
    } catch (e) {
      toast({ title: "Could not add person", description: (e as Error).message, variant: "destructive" });
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const token = (await getToken())!;
      if (direct.length && to) {
        await peopleApi.bulkOwnership(orgSlug!, workspaceSlug!, {
          action: "move",
          object_ids: direct.map((r) => r.item.object_id),
          owner: { type: "contact", id: person.id },
          target: { type: "contact", id: to },
        }, token);
      }
      for (const team of ledTeams) {
        if (team.id in leads) await peopleApi.updateTeam(orgSlug!, workspaceSlug!, team.id, { lead_contact_id: leads[team.id] }, token);
      }
      if (leaveTeams) {
        for (const team of teams) await peopleApi.removeTeamMember(orgSlug!, workspaceSlug!, team.id, person.id, token);
      }
      toast({ title: `Handed over ${person.name}'s work` });
      onClose();
    } catch (e) {
      toast({ title: "Could not finish the handover", description: (e as Error).message, variant: "destructive" });
    } finally {
      refresh();
      setBusy(false);
    }
  };

  const ready = (!direct.length || to) && ledTeams.every((t) => t.id in leads);
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-[520px] rounded-xl bg-white text-[13px] text-[#1c2230] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e6e8ee] px-5 py-3">
          <h3 className="text-[15px] font-semibold">Move everything from {person.name}</h3>
          <DetailPanelCloseButton onClose={onClose} />
        </div>
        <div className="space-y-4 px-5 py-4">
          {direct.length > 0 && (
            <div>
              <p className="mb-1.5">
                {direct.length} record{direct.length === 1 ? "" : "s"} name {first} directly. Move them to
              </p>
              <PersonPicker label="Move records to" people={others} value={to} createLabel="Create and pick" onPick={(c) => pick(c, setTo)} />
            </div>
          )}
          {ledTeams.length > 0 && (
            <div className="space-y-1.5">
              <p>{first} leads {ledTeams.length === 1 ? "a team" : `${ledTeams.length} teams`}. New lead:</p>
              {ledTeams.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-[140px] truncate font-medium">{t.name}</span>
                  <PersonPicker
                    label={`New lead for ${t.name}`}
                    people={others}
                    value={leads[t.id] ?? null}
                    placeholder={t.id in leads ? "No lead" : "Pick a new lead…"}
                    noneLabel="No lead"
                    createLabel="Create and pick"
                    onPick={(c) => pick(c, (id) => setLeads((l) => ({ ...l, [t.id]: id })))}
                  />
                </div>
              ))}
            </div>
          )}
          {teams.length > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={leaveTeams} onChange={(e) => setLeaveTeams(e.target.checked)} />
              Remove {first} from {teams.map((t) => t.name).join(", ")}
            </label>
          )}
          {to && direct.length > 0 && <p className="text-[12px] text-[#8b90a0]">Records will name {nameOf(to)} instead.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e6e8ee] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-[#5b6170]">Cancel</button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={run}
            className="rounded-md bg-[#5b4ce6] px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            {handoverSummary(direct.length, ledTeams.length)}
          </button>
        </div>
      </div>
    </div>
  );
}
