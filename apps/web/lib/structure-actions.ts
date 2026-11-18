import type { StructureDeleteImpact, StructureNodeKind } from "@minea/types";

export type StructureTarget = {
  id: string;
  kind: StructureNodeKind;
  name: string;
  domainId?: string | null;
  parentId?: string | null;
};

export function impactNoun(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function deleteConfirmLabel(kind: StructureNodeKind) {
  if (kind === "domain") return "Delete domain";
  if (kind === "activity") return "Delete activity";
  return "Delete capability";
}

export function deleteTitle(target: StructureTarget) {
  return `Delete ${target.name}?`;
}

/** Shared copy for the impact confirmation. Counts come from the API. */
export function impactSummary(impact: StructureDeleteImpact): { intro: string; rows: { label: string; value: number }[]; note: string } {
  const intro =
    impact.kind === "domain"
      ? "This will permanently delete the domain and everything inside it."
      : impact.kind === "capability"
        ? "This will delete the capability and the activities under it."
        : "This will delete the activity.";
  const rows: { label: string; value: number }[] = [];
  if (impact.kind === "domain") rows.push({ label: "Capabilities", value: impact.capabilities });
  if (impact.kind === "domain" || impact.kind === "capability") {
    rows.push({ label: "Activities", value: impact.activities });
  }
  rows.push({ label: "Application links", value: impact.application_links });
  return {
    intro,
    rows,
    note: "The applications themselves are not deleted. This cannot be undone.",
  };
}
