"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { ownerPicks } from "@/lib/owner-picks";
import { useTenancy } from "@/lib/tenancy";
import { useModelCatalog } from "@/lib/use-model-catalog";

export const TEAM_PICKS_ID = "owner-team-picks";
export const PERSON_PICKS_ID = "owner-person-picks";

/** Teams and people already in this workspace (People tables + owners on saved records). */
export function useOwnerPicks(typedTeams: string[] = [], typedPeople: string[] = []) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const catalog = useModelCatalog();
  const enabled = Boolean(orgSlug && workspaceSlug);
  const teams = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    enabled,
    retry: false,
    queryFn: async () => peopleApi.listTeams(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  const people = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug, ""],
    enabled,
    retry: false,
    queryFn: async () => peopleApi.listContacts(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  const objects = catalog.data?.objects ?? [];
  const teamList = useMemo(
    () => ownerPicks([...(teams.data?.items ?? []).map((team) => team.name), ...objects.map((object) => object.owner_team_name ?? object.owner)], typedTeams),
    [teams.data, objects, typedTeams],
  );
  const personList = useMemo(
    () => ownerPicks([...(people.data?.items ?? []).map((person) => person.name), ...objects.map((object) => object.point_of_contact_name)], typedPeople),
    [people.data, objects, typedPeople],
  );
  return { teams: teamList, people: personList };
}

/** <datalist>s any owner input can point at with list={TEAM_PICKS_ID} / list={PERSON_PICKS_ID}. */
export function OwnerDatalists({ teams, people }: { teams: string[]; people: string[] }) {
  return (
    <>
      <datalist id={TEAM_PICKS_ID} data-testid="team-picks">{teams.map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id={PERSON_PICKS_ID} data-testid="person-picks">{people.map((name) => <option key={name} value={name} />)}</datalist>
    </>
  );
}
