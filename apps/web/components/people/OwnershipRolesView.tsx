"use client";

import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { PeopleRole, PeopleRoleDetail } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import type { useOwnershipData } from "@/components/mvp/OwnersPage";
import { PersonPicker } from "@/components/people/PersonPicker";
import { useRefreshPeople, useResolvePerson } from "@/components/people/usePeople";
import { OWNERSHIP_ROLES, ROLE_CHIP } from "@/lib/ownership";
import { titleSuggestion } from "@/lib/people";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  business_owner: "Accountable for the record: budget, changes and when it retires.",
  technical_owner: "Runs and changes it: architecture, upgrades, integrations.",
  support_team: "First call when it breaks.",
};

type Data = ReturnType<typeof useOwnershipData>;

/** The three ownership roles every record uses, plus a one-time review of the old free-form roles. */
export function OwnershipRolesView({ data }: { data: Data }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const old = useQuery({
    queryKey: ["people-roles", orgSlug, workspaceSlug],
    enabled: Boolean(orgSlug && workspaceSlug),
    queryFn: async () => peopleApi.listRoles(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  const roles = old.data?.items ?? [];
  const details = useQueries({
    queries: roles.map((r) => ({
      queryKey: ["people-role", orgSlug, workspaceSlug, r.id],
      queryFn: async () => peopleApi.getRole(orgSlug!, workspaceSlug!, r.id, (await getToken())!),
    })),
  });

  return (
    <div className="max-w-3xl space-y-6 text-[13px]">
      <ul className="divide-y divide-[#f0f1f5] rounded-xl border border-[#e6e8ee]">
        {OWNERSHIP_ROLES.map((r) => {
          const count = data.items.filter((i) => i.roles[r.key]).length;
          return (
            <li key={r.key} className="flex items-center gap-4 px-4 py-3">
              <span className={cn("w-[80px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold", ROLE_CHIP[r.key].className)}>
                {ROLE_CHIP[r.key].label}
              </span>
              <span className="flex-1">
                <span className="font-medium">{r.label}</span>
                <span className="block text-[#8b90a0]">{ROLE_DESCRIPTIONS[r.key]}</span>
              </span>
              <span className="text-[#5b6170]">{count} record{count === 1 ? "" : "s"}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[#8b90a0]">
        Set these on each record, or in bulk from a person or team. A person&apos;s job title lives on the person.
      </p>

      {roles.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <h2 className="text-[15px] font-semibold">Old roles — review once</h2>
          <p className="mb-3 text-[#5b6170]">
            Roles are now just ownership roles. Keep each old role as someone&apos;s title, or drop it. Nothing is deleted.
          </p>
          <ul className="space-y-2">
            {roles.map((role, i) => (
              <OldRoleRow key={role.id} role={role} detail={details[i]?.data} data={data} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OldRoleRow({ role, detail, data }: { role: PeopleRole; detail?: PeopleRoleDetail; data: Data }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const resolve = useResolvePerson();
  const refresh = useRefreshPeople();
  const suggestion = detail ? titleSuggestion(detail.teams, data.contacts) : null;
  const [mode, setMode] = useState<"title" | "drop">("title");
  const [personId, setPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = personId ?? suggestion?.contactId ?? null;
  const usedBy = (detail?.teams ?? []).map((t) => (t.assignee_name ? `${t.team_name} (${t.assignee_name})` : t.team_name));

  const apply = async () => {
    setBusy(true);
    try {
      const body =
        mode === "drop" || !chosen
          ? {}
          : { title_contact_id: chosen, ...(chosen === suggestion?.contactId ? { team_id: suggestion.teamId } : {}) };
      await peopleApi.retireRole(orgSlug!, workspaceSlug!, role.id, body, (await getToken())!);
      toast({ title: mode === "drop" ? `Dropped ${role.name}` : `${role.name} is now a title` });
      refresh();
    } catch (e) {
      toast({ title: "Could not apply", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e6e8ee] bg-white px-3 py-2">
      <span className="min-w-[160px] flex-1">
        <span className="font-medium">{role.name}</span>
        {usedBy.length > 0 && <span className="block text-[12px] text-[#8b90a0]">on {usedBy.join(", ")}</span>}
      </span>
      <label className="flex items-center gap-1.5">
        <input type="radio" name={`r-${role.id}`} checked={mode === "title"} onChange={() => setMode("title")} />
        Make title of
      </label>
      <PersonPicker
        label={`Title for ${role.name}`}
        people={data.contacts}
        value={chosen}
        disabled={mode !== "title"}
        createLabel="Create and pick"
        onPick={async (c) => setPersonId(await resolve(c))}
        className="min-w-[170px]"
      />
      <label className="flex items-center gap-1.5">
        <input type="radio" name={`r-${role.id}`} checked={mode === "drop"} onChange={() => setMode("drop")} />
        Drop
      </label>
      <button
        type="button"
        disabled={busy || (mode === "title" && !chosen)}
        onClick={apply}
        className="rounded-md bg-[#5b4ce6] px-3 py-1.5 font-medium text-white disabled:opacity-40"
      >
        Apply
      </button>
    </li>
  );
}
