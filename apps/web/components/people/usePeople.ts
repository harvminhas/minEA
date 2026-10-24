"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { PeopleContact } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import type { PersonChoice } from "@/components/people/PersonPicker";

/** Lists and panels that show people, teams or owners; refresh them all after a change. */
export function useRefreshPeople() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["people-contacts", "people-contact", "people-teams", "people-team", "teams", "ownership", "model-nav-extras"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** Resolve a picker choice to a person id, creating the new person first when asked. */
export function useResolvePerson() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const refresh = useRefreshPeople();
  return async (choice: PersonChoice, extra: { team_id?: string } = {}): Promise<string | null> => {
    if (!("create" in choice)) return choice.contactId;
    const made: PeopleContact = await peopleApi.createContact(
      orgSlug!,
      workspaceSlug!,
      { name: choice.create.name, email: choice.create.email, title: choice.create.title, ...extra },
      (await getToken())!,
    );
    refresh();
    return made.id;
  };
}
