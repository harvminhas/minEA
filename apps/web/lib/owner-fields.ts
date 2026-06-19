import type { OwnershipFields } from "@minea/types";

export interface OwnershipValue {
  ownerTeamId: string;
  ownerTeamName: string;
  pointOfContactId: string;
  pointOfContactName: string;
}

export function emptyOwnership(): OwnershipValue {
  return {
    ownerTeamId: "",
    ownerTeamName: "",
    pointOfContactId: "",
    pointOfContactName: "",
  };
}

export function ownershipFromEntity(
  entity?: Partial<OwnershipFields> & { owner?: string | null } | null
): OwnershipValue {
  if (!entity) return emptyOwnership();
  return {
    ownerTeamId: entity.owner_team_id ?? "",
    ownerTeamName: entity.owner_team_name ?? entity.owner ?? "",
    pointOfContactId: entity.point_of_contact_id ?? "",
    pointOfContactName: entity.point_of_contact_name ?? "",
  };
}

export function ownershipToPayload(value: OwnershipValue): OwnershipFields & { owner?: string } {
  const ownerTeamName = value.ownerTeamName.trim();
  return {
    owner_team_id: value.ownerTeamId || null,
    owner_team_name: ownerTeamName || null,
    owner: ownerTeamName || undefined,
    point_of_contact_id: value.pointOfContactId || null,
    point_of_contact_name: value.pointOfContactName.trim() || null,
  };
}

export function ownershipIsValid(value: OwnershipValue): boolean {
  return Boolean(value.ownerTeamName.trim());
}

export function formatOwnershipLabel(
  ownerTeamName?: string | null,
  pointOfContactName?: string | null,
  legacyOwner?: string | null
): string {
  const team = ownerTeamName ?? legacyOwner;
  if (!team) return "—";
  const poc = pointOfContactName?.trim();
  if (!poc) return team;
  return `${team} · ${poc}`;
}
