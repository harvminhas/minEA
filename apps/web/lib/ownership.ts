import {
  OBJECT_TYPE_LABELS,
  type ObjectOwnership,
  type OwnerRef,
  type OwnershipRole,
  type RoleOwner,
} from "@minea/types";

export const OWNERSHIP_ROLES: { key: OwnershipRole; label: string }[] = [
  { key: "business_owner", label: "Business owner" },
  { key: "technical_owner", label: "Technical owner" },
  { key: "support_team", label: "Support team" },
];

export const roleLabel = (role: OwnershipRole) =>
  OWNERSHIP_ROLES.find((r) => r.key === role)?.label ?? role;

export const typeLabel = (type: string) =>
  OBJECT_TYPE_LABELS[type as keyof typeof OBJECT_TYPE_LABELS] ??
  type.replace(/_/g, " ");

/** Roles this team or contact holds on one record (a lead shown in for a team does not count). */
export function rolesHeld(
  item: ObjectOwnership,
  owner: OwnerRef,
): OwnershipRole[] {
  return OWNERSHIP_ROLES.map((r) => r.key).filter((role) => {
    const h = item.roles[role];
    if (!h) return false;
    return owner.type === "team"
      ? h.team_id === owner.id
      : h.contact_id === owner.id && !h.contact_is_lead;
  });
}

export function ownedBy(items: ObjectOwnership[], owner: OwnerRef) {
  return items.flatMap((item) => {
    const roles = rolesHeld(item, owner);
    return roles.length ? [{ item, roles }] : [];
  });
}

/** Grouped by type label, groups and items A–Z. */
export function groupByType<T>(
  rows: T[],
  typeOf: (row: T) => string,
  nameOf: (row: T) => string,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const label = typeLabel(typeOf(row));
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({
      label,
      items: [...items].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }));
}

export interface PickerFilter {
  q: string;
  unowned: boolean;
  type: string; // "" = any
  category: string; // "" = any; applications only
}

export function filterPicker(items: ObjectOwnership[], f: PickerFilter) {
  const q = f.q.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!q || i.name.toLowerCase().includes(q)) &&
      (!f.unowned || !i.owned) &&
      (!f.type || i.type === f.type) &&
      (!f.category || (i.type === "application" && i.category === f.category)),
  );
}

export const typesIn = (items: ObjectOwnership[]) =>
  [...new Set(items.map((i) => i.type))].sort((a, b) =>
    typeLabel(a).localeCompare(typeLabel(b)),
  );

export const categoriesIn = (items: ObjectOwnership[]) =>
  [
    ...new Set(
      items
        .filter((i) => i.type === "application" && i.category)
        .map((i) => i.category as string),
    ),
  ].sort();

/** "Finance · Ana Ruiz (lead)" */
export function holderLabel(h?: RoleOwner | null): string {
  if (!h) return "";
  const contact = h.contact_name
    ? `${h.contact_name}${h.contact_is_lead ? " (lead)" : ""}`
    : "";
  return [h.team_name, contact].filter(Boolean).join(" · ");
}

export const ROLE_CHIP: Record<OwnershipRole, { label: string; className: string }> = {
  business_owner: { label: "Business", className: "bg-[#f1efff] text-[#5b4ce6]" },
  technical_owner: { label: "Technical", className: "bg-[#e7f3ff] text-[#1769c2]" },
  support_team: { label: "Support", className: "bg-[#e9f7ef] text-[#1f8a4c]" },
};

export interface TeamOwnedRow {
  item: ObjectOwnership;
  roles: { role: OwnershipRole; contact: string; isLead: boolean }[];
}

/** Records a team holds any role on (roles, or owner_team_id read as Business owner), with the contact per role. */
export function teamOwnedRows(items: ObjectOwnership[], teamId: string): TeamOwnedRow[] {
  return ownedBy(items, { type: "team", id: teamId }).map(({ item, roles }) => ({
    item,
    roles: roles.map((role) => {
      const h = item.roles[role];
      return { role, contact: h?.contact_name ?? "", isLead: Boolean(h?.contact_is_lead) };
    }),
  }));
}

export const membersOf = (contacts: { team_id?: string | null }[], teamId: string) =>
  contacts.filter((c) => c.team_id === teamId).length;
