import type { MinEAObject } from "@minea/types";
import { getStatusLabel } from "@/lib/utils";

export const SYSTEM_OBJECT_TYPES = new Set([
  "application",
  "solution",
  "technical_capability",
]);

export function isSystemObject(object: MinEAObject): boolean {
  return SYSTEM_OBJECT_TYPES.has(object.type);
}

export const SYSTEM_STATUS_STYLE: Record<string, string> = {
  planned: "bg-stone-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  retiring: "bg-orange-50 text-orange-700",
  retired: "bg-gray-100 text-gray-400",
  deprecated: "bg-gray-100 text-gray-500",
  under_evaluation: "bg-amber-50 text-amber-700",
};

export function formatUpdatedAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  const diffM = Math.floor(diffD / 30);
  if (diffM < 12) return `${diffM}mo ago`;
  return `${Math.floor(diffM / 12)}y ago`;
}

/** Card metrics line — mirrors product coverage format. */
export function formatSystemCoverageLine(object: MinEAObject): string {
  const apisProvided = object.apis_provided_count ?? 0;
  const apisConsumed = object.apis_consumed_count ?? 0;
  const stores = object.data_store_count ?? 0;
  return `1 system · ${apisProvided} API${apisProvided === 1 ? "" : "s"} provided · ${apisConsumed} consumed · ${stores} data store${stores === 1 ? "" : "s"}`;
}

export function systemStatusLabel(status?: string | null): string {
  if (!status) return "Planned";
  return getStatusLabel(status);
}
