/** People & teams helpers: picking people, what a person owns, and the old-roles review. */
import {
  accountabilityLabel,
  type ObjectOwnership,
  type OwnershipRole,
  type PeopleAccountability,
  type PeopleContact,
  type Team,
  type TeamUsingRole,
} from "@minea/types";
import { OWNERSHIP_ROLES, ownedBy } from "@/lib/ownership";
import { accountabilityDisplayKind } from "@/lib/people-utils";

const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** People whose name or email contains the query, A–Z. */
export function matchPeople<T extends Pick<PeopleContact, "name" | "email">>(people: T[], q: string, limit = 8): T[] {
  const k = key(q);
  return people
    .filter((p) => !k || key(p.name).includes(k) || (p.email ?? "").toLowerCase().includes(k))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Typed a name nobody in People has: offer "+ New person". */
export const canCreatePerson = (people: Pick<PeopleContact, "name">[], q: string) =>
  key(q).length > 0 && !people.some((p) => key(p.name) === key(q));

/** Teams a person is on (membership), falling back to the primary team for older rows. */
export function teamsOf(person: Pick<PeopleContact, "teams" | "team_id" | "team_name">) {
  if (person.teams?.length) return person.teams;
  return person.team_id ? [{ id: person.team_id, name: person.team_name ?? "", title: null }] : [];
}

export const memberCount = (people: Pick<PeopleContact, "teams" | "team_id" | "team_name">[], teamId: string) =>
  people.filter((p) => teamsOf(p).some((t) => t.id === teamId)).length;

export interface PersonOwnedRow {
  item: ObjectOwnership;
  roles: { role: OwnershipRole; team: string }[];
}

/** Directly: the person is named on the record. Via team: they lead the team named on it (no one else named). */
export function personOwns(items: ObjectOwnership[], contactId: string) {
  const direct: PersonOwnedRow[] = ownedBy(items, { type: "contact", id: contactId }).map(({ item, roles }) => ({
    item,
    roles: roles.map((role) => ({ role, team: item.roles[role]?.team_name ?? "" })),
  }));
  const viaTeam: PersonOwnedRow[] = items.flatMap((item) => {
    const roles = OWNERSHIP_ROLES.map((r) => r.key)
      .filter((role) => item.roles[role]?.contact_id === contactId && item.roles[role]?.contact_is_lead)
      .map((role) => ({ role, team: item.roles[role]?.team_name ?? "" }));
    return roles.length ? [{ item, roles }] : [];
  });
  return { direct, viaTeam };
}

export const teamsLedBy = (teams: Team[], contactId: string) => teams.filter((t) => t.lead_contact_id === contactId);

/** "Move N records" in the leaving dialog: only records the person is named on (team-led ones follow the new lead). */
export function handoverSummary(directCount: number, ledTeams: number) {
  const parts = [];
  if (directCount) parts.push(`Move ${directCount} record${directCount === 1 ? "" : "s"}`);
  if (ledTeams) parts.push(`hand over ${ledTeams} team${ledTeams === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "Done";
}

/** "informed about CRM, ERP · approves Payroll" — the non-owner links, one short line. */
export function alsoLinked(rows: Pick<PeopleAccountability, "link_kind" | "is_owner" | "entity_name">[]) {
  const byVerb = new Map<string, string[]>();
  for (const r of rows) {
    const verb = accountabilityLabel(accountabilityDisplayKind(r)).forward.toLowerCase();
    byVerb.set(verb, [...(byVerb.get(verb) ?? []), r.entity_name]);
  }
  return [...byVerb.entries()].map(([verb, names]) => `${verb} ${names.sort().join(", ")}`).join(" · ");
}

/** Old-roles review: whose title this role should become (the first named assignee who is in People). */
export function titleSuggestion(teams: TeamUsingRole[], people: Pick<PeopleContact, "id" | "name">[]) {
  for (const t of teams) {
    const person = t.assignee_name ? people.find((p) => key(p.name) === key(t.assignee_name!)) : undefined;
    if (person) return { contactId: person.id, name: person.name, teamId: t.team_id, teamName: t.team_name };
  }
  return null;
}
