"use client";

interface Props {
  unassignedEntityCount: number;
  unassignedStoreCount: number;
  focus?: "entities" | "stores" | "all";
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DataGovernanceGapBanner({
  unassignedEntityCount,
  unassignedStoreCount,
  focus = "all",
}: Props) {
  const parts: string[] = [];

  if ((focus === "entities" || focus === "all") && unassignedEntityCount > 0) {
    parts.push(formatCount(unassignedEntityCount, "entity", "entities"));
  }
  if ((focus === "stores" || focus === "all") && unassignedStoreCount > 0) {
    parts.push(formatCount(unassignedStoreCount, "store", "stores"));
  }

  if (parts.length === 0) return null;

  const subject = parts.join(" and ");
  const verb = parts.length === 1 && (unassignedEntityCount + unassignedStoreCount) === 1 ? "is" : "are";

  return (
    <div className="mx-8 mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900">
            {subject} unassigned to a data domain
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80 leading-relaxed">
            {subject} {verb} not governed yet. This does not block the map — assign domains when your
            governance structure is ready.
          </p>
        </div>
      </div>
    </div>
  );
}
