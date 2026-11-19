import type { EntityAccountability, MinEAObject, ObjectOwnership } from "@minea/types";

/** A person or team that owns a capability, activity, or domain. */
export type EntityOwnerRef = {
  subjectType: "contact" | "team" | "role" | "legacy";
  subjectId: string;
  name: string;
  accountabilityId?: string;
  source: "accountability" | "ownership_role" | "legacy";
};

const OWNER_KINDS = new Set(["owns", "manages", "stewards"]);

export function isOwnerAccountability(item: Pick<EntityAccountability, "link_kind">): boolean {
  return OWNER_KINDS.has(String(item.link_kind));
}

/**
 * One owner concept: people-accountability "owns" (and legacy owner verbs) is the source of truth.
 * If none exist, fall back to catalog owner columns and the business_owner ownership role so
 * existing data still shows until a backfill is approved.
 */
export function resolveEntityOwners(input: {
  accountabilities?: EntityAccountability[] | null;
  /** Role rows (entity_kind=object, link_kind=business_owner) — display fallback only. */
  roleAccountabilities?: EntityAccountability[] | null;
  object?: Pick<
    MinEAObject,
    "owner" | "owner_team_id" | "owner_team_name" | "point_of_contact_id" | "point_of_contact_name"
  > | null;
  ownership?: ObjectOwnership | null;
}): { owners: EntityOwnerRef[]; usedFallback: boolean } {
  const fromAccountability: EntityOwnerRef[] = [];
  for (const item of input.accountabilities ?? []) {
    if (!isOwnerAccountability(item)) continue;
    const subjectType =
      item.subject_type === "contact" || item.subject_type === "team" || item.subject_type === "role"
        ? item.subject_type
        : "contact";
    fromAccountability.push({
      subjectType,
      subjectId: item.subject_id,
      name: item.subject_name,
      accountabilityId: item.id,
      source: "accountability",
    });
  }
  if (fromAccountability.length > 0) return { owners: dedupeOwners(fromAccountability), usedFallback: false };

  const fallback: EntityOwnerRef[] = [];
  const object = input.object;
  if (object?.point_of_contact_id || object?.point_of_contact_name?.trim()) {
    fallback.push({
      subjectType: "contact",
      subjectId: object.point_of_contact_id ?? "",
      name: object.point_of_contact_name?.trim() || "Owner",
      source: "legacy",
    });
  }
  if (object?.owner_team_id || object?.owner_team_name?.trim()) {
    fallback.push({
      subjectType: "team",
      subjectId: object.owner_team_id ?? "",
      name: object.owner_team_name?.trim() || "Owner team",
      source: "legacy",
    });
  }
  for (const item of input.roleAccountabilities ?? []) {
    if (item.link_kind !== "business_owner") continue;
    const subjectType =
      item.subject_type === "contact" || item.subject_type === "team" || item.subject_type === "role"
        ? item.subject_type
        : "contact";
    fallback.push({
      subjectType,
      subjectId: item.subject_id,
      name: item.subject_name,
      accountabilityId: item.id,
      source: "ownership_role",
    });
  }
  const business = input.ownership?.roles?.business_owner;
  if (business?.contact_id || business?.contact_name) {
    fallback.push({
      subjectType: "contact",
      subjectId: business.contact_id ?? "",
      name: business.contact_name?.trim() || business.team_name?.trim() || "Owner",
      source: "ownership_role",
    });
  } else if (business?.team_id || business?.team_name) {
    fallback.push({
      subjectType: "team",
      subjectId: business.team_id ?? "",
      name: business.team_name?.trim() || "Owner team",
      source: "ownership_role",
    });
  }
  const legacyName = object?.owner?.trim();
  if (legacyName && !fallback.some((item) => item.name.toLowerCase() === legacyName.toLowerCase())) {
    fallback.push({
      subjectType: "legacy",
      subjectId: "",
      name: legacyName,
      source: "legacy",
    });
  }
  return { owners: dedupeOwners(fallback), usedFallback: fallback.length > 0 };
}

export function ownerLineLabel(owners: EntityOwnerRef[]): string | null {
  if (owners.length === 0) return null;
  if (owners.length === 1) return owners[0]!.name;
  return `${owners[0]!.name} +${owners.length - 1}`;
}

function dedupeOwners(owners: EntityOwnerRef[]): EntityOwnerRef[] {
  const seen = new Set<string>();
  const out: EntityOwnerRef[] = [];
  for (const owner of owners) {
    const key = `${owner.subjectType}:${owner.subjectId || owner.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(owner);
  }
  return out;
}
