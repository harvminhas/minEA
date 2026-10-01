import { infraConfig, isManagedKind } from "@/lib/infra/infraConfig";

export type InfraStatus = "out_of_support" | "unsupported_os" | "ends_soon" | "ok" | "unknown";

export type InfraStatusResult = {
  status: InfraStatus;
  severity: "bad" | "warn" | "ok" | "none";
  label: string;
  daysLeft: number | null;
  effectiveDate: string | null;
  dateSource: "support_ends" | "os" | null;
  osMatch: { name: string; version: string; ends: string } | null;
  reason: string;
};

export type RuntimeLike = {
  id?: string;
  name?: string;
  runtimeKind?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  supportEnds?: string | null;
};

const DAY = 86_400_000;

function dayStamp(value: string | null | undefined): number | null {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function todayStamp(today: Date): number {
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / DAY);
}

function formatLong(iso: string): string {
  const stamp = dayStamp(iso);
  if (stamp == null) return iso;
  return new Date(stamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function collapse(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchOs(name: string | null | undefined, version: string | null | undefined) {
  const osName = collapse(name ?? "");
  const osVersion = collapse(version ?? "");
  if (!osName || !osVersion) return null;
  for (const entry of infraConfig.eolOs) {
    if (collapse(entry.name) !== osName) continue;
    const listed = collapse(entry.version);
    const prefix = "match" in entry && entry.match === "prefix";
    if (prefix ? osVersion.startsWith(listed) : osVersion === listed) return entry;
  }
  return null;
}

function result(
  status: InfraStatus,
  label: string,
  daysLeft: number | null,
  effectiveDate: string | null,
  dateSource: "support_ends" | "os" | null,
  osMatch: InfraStatusResult["osMatch"],
  reason: string,
): InfraStatusResult {
  const severity = status === "out_of_support" || status === "unsupported_os" ? "bad" : status === "ends_soon" ? "warn" : status === "ok" ? "ok" : "none";
  return { status, severity, label, daysLeft, effectiveDate, dateSource, osMatch, reason };
}

/** First matching rule wins. end_of_life is not a status input. */
export function infraStatus(runtime: RuntimeLike, today: Date, cfg = infraConfig): InfraStatusResult {
  const now = todayStamp(today);
  const support = dayStamp(runtime.supportEnds);
  const os = matchOs(runtime.osName, runtime.osVersion);
  const osEnds = os ? dayStamp(os.ends) : null;
  const effective = runtime.supportEnds?.trim() || os?.ends || null;
  const source = runtime.supportEnds?.trim() ? "support_ends" : os ? "os" : null;

  if (support != null && support < now) {
    const days = daysBetween(now, support);
    return result(
      "out_of_support",
      "Out of support",
      days,
      effective,
      "support_ends",
      os,
      `Support ended ${formatLong(runtime.supportEnds!.trim())}`,
    );
  }
  if (os && osEnds != null && osEnds < now) {
    return result(
      "unsupported_os",
      "Unsupported OS",
      daysBetween(now, osEnds),
      os.ends,
      "os",
      os,
      `${os.name} ${os.version} standard support ended ${formatLong(os.ends)}`,
    );
  }

  const candidates: { stamp: number; source: "support_ends" | "os"; iso: string }[] = [];
  if (support != null) candidates.push({ stamp: support, source: "support_ends", iso: runtime.supportEnds!.trim() });
  if (osEnds != null) candidates.push({ stamp: osEnds, source: "os", iso: os!.ends });
  candidates.sort((a, b) => a.stamp - b.stamp);
  const soon = candidates[0];
  if (soon) {
    const days = daysBetween(now, soon.stamp);
    if (days >= 0 && days < cfg.status.endsSoonDays) {
      return result("ends_soon", `Ends in ${days} days`, days, soon.iso, soon.source, os, `Support ends ${formatLong(soon.iso)}`);
    }
    return result("ok", "OK", days, effective, source, os, effective ? `Supported through ${formatLong(effective)}` : "OK");
  }
  if (isManagedKind(runtime.runtimeKind)) {
    return result("ok", "OK", null, null, null, null, "Managed cloud service");
  }
  return result("unknown", "Not set", null, null, null, null, "No support date");
}

export function infraStatusMany(runtimes: RuntimeLike[], today: Date): Map<string, InfraStatusResult> {
  const map = new Map<string, InfraStatusResult>();
  for (const runtime of runtimes) {
    if (runtime.id) map.set(runtime.id, infraStatus(runtime, today));
  }
  return map;
}

export function agingSummary(runtimes: RuntimeLike[], today: Date) {
  const items = runtimes.map((runtime) => ({ runtime, status: infraStatus(runtime, today) }));
  return {
    outOfSupportOrOs: items.filter((item) => item.status.status === "out_of_support" || item.status.status === "unsupported_os").length,
    endsSoon: items.filter((item) => item.status.status === "ends_soon").length,
    unknown: items.filter((item) => item.status.status === "unknown").length,
    items,
  };
}
