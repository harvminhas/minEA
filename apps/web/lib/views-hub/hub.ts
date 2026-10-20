import { aiLandscape, FLAG_LABELS, type FlagId, type LandscapeEdge, type LandscapeObject } from "@/lib/ai/landscape";
import { catalogStats, moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { hostingMap, singlePoints, type HomeEdge } from "@/lib/reports/home";
import { centsLabel, idleLicences, overlaps } from "@/lib/reports/cio-views";

export type HubTone = "red" | "amber" | "ok" | "empty";
export type HubCardId = "ai" | "spof" | "owners" | "hosting" | "impact" | "renewals" | "licences" | "overlaps";

type Base = {
  id: HubCardId;
  title: string;
  tone: HubTone;
  /** Big number or status. */
  big: string;
  unit?: string;
  pill: string;
  line: string;
  /** Report id (opens /reports/<id>) or "impact" (opens /views/impact). */
  open: { kind: "report"; reportId: string; label: string } | { kind: "impact"; label: string; sel?: string } | { kind: "model"; section: string; label: string };
};

export type HubCard =
  | (Base & { id: "ai"; preview: { flags: { id: FlagId; title: string; count: number; high: number }[]; agents: number; models: number; features: number } })
  | (Base & { id: "spof"; preview: { name: string; count: number }[] })
  | (Base & { id: "owners"; preview: { name: string; type: string }[]; more: number })
  | (Base & { id: "hosting"; preview: { cloud: number; servers: number; desktop: number; unknown: number } })
  | (Base & { id: "impact"; preview: { source: string; dependents: string[] } | null })
  | (Base & { id: "renewals"; preview: { name: string; date: string; cost: string }[] })
  | (Base & { id: "licences"; preview: { name: string; idle: number; wasted: string }[]; counted: number; licensed: number })
  | (Base & { id: "overlaps"; preview: { name: string; tools: string[] }[]; savings: string });

const TONE_RANK: Record<HubTone, number> = { red: 0, amber: 1, ok: 2, empty: 3 };

/**
 * The Views hub cards from live workspace data. Every count uses the same function as its report
 * (aiLandscape, singlePoints, catalogStats.noOwner, hostingMap, renewalSoon rows) so they always agree.
 */
export function viewsHub(input: {
  rows: CatalogRow[];
  edges: HomeEdge[];
  objects: readonly LandscapeObject[];
  relationships: readonly LandscapeEdge[];
}): HubCard[] {
  const { rows, edges } = input;
  const cards: HubCard[] = [];

  // AI landscape (report "ai-landscape").
  const ai = aiLandscape({ objects: input.objects, relationships: input.relationships });
  const ids = Object.keys(FLAG_LABELS) as FlagId[];
  const flags = ids.map((id) => {
    const of = ai.flags.filter((flag) => flag.id === id);
    return { id, title: FLAG_LABELS[id].title, count: of.length, high: of.filter((flag) => flag.severity === "high").length };
  });
  const models = ai.platforms.filter((item) => item.kindLabel === "Model").length;
  const nothingAi = ai.agents.length === 0 && ai.features.length === 0 && models === 0;
  cards.push({
    id: "ai",
    title: "AI landscape",
    tone: nothingAi ? "empty" : ai.highFlags > 0 ? "red" : ai.flags.length > 0 ? "amber" : "ok",
    big: nothingAi ? "No AI yet" : String(ai.flags.length),
    unit: nothingAi ? undefined : ai.flags.length === 1 ? "risk flag" : "risk flags",
    pill: nothingAi ? "Get started" : ai.highFlags ? `${ai.highFlags} high` : ai.flags.length ? "Check" : "All clear",
    line: nothingAi
      ? "No AI agents yet. Add one, or check your apps for built-in AI like Copilot."
      : "Agents and AI features that can see or change sensitive data.",
    open: nothingAi ? { kind: "model", section: "agents", label: "Add an AI agent" } : { kind: "report", reportId: "ai-landscape", label: "Open" },
    preview: { flags, agents: ai.agents.length, models, features: ai.features.length },
  });

  // Single points of failure (report "single-points": SpofReport uses singlePoints()).
  const spof = singlePoints(rows, edges);
  const hosts = rows.filter((row) => row.kind === "platform" || row.kind === "runtime").length;
  cards.push({
    id: "spof",
    title: "Single points of failure",
    tone: spof.length ? (spof[0]!.count >= 5 ? "red" : "amber") : hosts ? "ok" : "empty",
    big: hosts ? String(spof.length) : "—",
    unit: hosts ? "servers & platforms" : undefined,
    pill: spof.length ? (spof[0]!.count >= 5 ? "High" : "Check") : hosts ? "None" : "No servers yet",
    line: spof.length
      ? "Each has 3 or more things running on or built on it."
      : hosts
        ? "Nothing has 3 or more things running on it."
        : "Add your servers and platforms and link apps to them to find these.",
    open: hosts ? { kind: "report", reportId: "single-points", label: "Open" } : { kind: "model", section: "servers", label: "Add a server" },
    preview: spof.slice(0, 3).map((host) => ({ name: host.name, count: host.count })),
  });

  // No owner (report "ownership-gaps": catalogStats(rows).noOwner).
  const stats = catalogStats(rows);
  const tracked = rows.length;
  cards.push({
    id: "owners",
    title: "No owner",
    tone: tracked === 0 ? "empty" : stats.noOwner.length ? "amber" : "ok",
    big: tracked === 0 ? "—" : String(stats.noOwner.length),
    unit: tracked ? `of ${tracked}` : undefined,
    pill: tracked === 0 ? "Nothing yet" : stats.noOwner.length ? "Fix" : "All owned",
    line: tracked === 0
      ? "Add your apps first; then name who is accountable for each."
      : stats.noOwner.length
        ? "Nobody is accountable when these break or come up for renewal."
        : "Every record has an owner.",
    open: tracked ? { kind: "report", reportId: "ownership-gaps", label: "Open" } : { kind: "model", section: "applications", label: "Add apps" },
    preview: stats.noOwner.slice(0, 3).map((row) => ({ name: row.name, type: row.typeLabel })),
    more: Math.max(0, stats.noOwner.length - 3),
  });

  // Where things run (report "hosting": hostingMap().unlinked is the "no host linked" count).
  const apps = rows.filter((row) => row.kind === "application");
  const map = hostingMap(rows, edges);
  const split = { cloud: 0, servers: 0, desktop: 0, unknown: 0 };
  for (const app of apps) {
    const hosting = String((app.object.properties as Record<string, unknown> | undefined)?.hosting_model ?? "").toLowerCase();
    const linked = edges.some((edge) => edge.fromId === app.id && (edge.type === "runs_on" || edge.type === "built_on"));
    if (hosting === "saas" || hosting === "cloud") split.cloud += 1;
    else if (hosting === "desktop") split.desktop += 1;
    else if (linked || hosting === "on_premise") split.servers += 1;
    else split.unknown += 1;
  }
  cards.push({
    id: "hosting",
    title: "Where things run",
    tone: apps.length === 0 ? "empty" : map.unlinked ? "amber" : "ok",
    big: apps.length ? String(apps.length - map.unlinked) : "—",
    unit: apps.length ? `of ${apps.length} known` : undefined,
    pill: apps.length === 0 ? "Nothing yet" : map.unlinked ? `${map.unlinked} unknown` : "All known",
    line: apps.length ? "Cloud, your own servers, or installed on people's computers." : "Add apps and say where each one runs.",
    open: { kind: "report", reportId: "hosting", label: "Open" },
    preview: split,
  });

  // Impact analysis (the /views/impact screen): seeded with the busiest host.
  const top = spof[0];
  cards.push({
    id: "impact",
    title: "Impact analysis",
    tone: rows.length ? "ok" : "empty",
    big: top?.name ?? (rows.length ? "Pick an app" : "—"),
    pill: "Try it",
    line: rows.length ? "Pick an app or server to see what breaks if it goes down." : "Add apps and link them to see what breaks when one fails.",
    open: { kind: "impact", label: "Pick an app", sel: top?.id },
    preview: top ? { source: top.name, dependents: top.dependents.slice(0, 4).map((item) => item.name) } : null,
  });

  // Renewals (report "renewals": rows with renewalSoon, next 90 days).
  const soon = rows.filter((row) => row.renewalSoon).sort((a, b) => (a.renewalDate?.getTime() ?? 0) - (b.renewalDate?.getTime() ?? 0));
  const anyDates = rows.some((row) => row.renewalDate);
  const spend = soon.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0);
  cards.push({
    id: "renewals",
    title: "Renewals coming up",
    tone: soon.length ? "amber" : anyDates ? "ok" : "empty",
    big: soon.length ? String(soon.length) : anyDates ? "0" : "No dates yet",
    unit: soon.length || anyDates ? "next 90 days" : undefined,
    pill: soon.length ? (spend ? moneyLabel(spend) : "Due soon") : anyDates ? "Nothing due" : "Add dates",
    line: soon.length
      ? "Contracts and licences up for renewal, and what they cost."
      : anyDates
        ? "Nothing renews in the next 90 days."
        : "No renewal dates yet. Add them on each app to see what's coming up.",
    open: { kind: "report", reportId: "renewals", label: "Open" },
    preview: soon.slice(0, 3).map((row) => ({ name: row.name, date: row.renewalLabel, cost: row.annualCostLabel })),
  });

  // Idle licences (report "idle-licences": idleLicences()).
  const idle = idleLicences(input.objects);
  const licensed = idle.rows.length + idle.missing.length;
  const wasted = idle.totals.wastedCents;
  cards.push({
    id: "licences",
    title: "Idle licences",
    tone: idle.rows.length === 0 ? "empty" : idle.totals.idle > 0 ? "amber" : "ok",
    big: idle.rows.length ? idle.totals.idle.toLocaleString("en-US") : "—",
    unit: idle.rows.length ? `idle of ${idle.totals.bought.toLocaleString("en-US")}` : undefined,
    pill: idle.rows.length === 0 ? (licensed ? "Add in use" : "Nothing yet") : wasted ? `${centsLabel(wasted)} / yr` : idle.totals.idle ? "Check" : "None idle",
    line: idle.rows.length
      ? "Licences you pay for that nobody is using."
      : licensed
        ? "Add how many licences are in use on each app to see what's idle."
        : "Add licence counts on your apps to find idle licences.",
    open: { kind: "report", reportId: "idle-licences", label: idle.rows.length ? "Open" : licensed ? "Add in-use counts" : "Open" },
    preview: idle.rows.filter((row) => row.idle > 0).slice(0, 3).map((row) => ({ name: row.name, idle: row.idle, wasted: row.wastedCents ? centsLabel(row.wastedCents) : "" })),
    counted: idle.rows.length,
    licensed,
  });

  // Overlapping tools (report "overlaps": overlaps()).
  const over = overlaps(input.objects, input.relationships);
  const anyCapabilityLinks = input.relationships.some((edge) => edge.type === "supported_by");
  cards.push({
    id: "overlaps",
    title: "Overlapping tools",
    tone: over.groups.length ? "amber" : anyCapabilityLinks ? "ok" : "empty",
    big: over.groups.length || anyCapabilityLinks ? String(over.groups.length) : "—",
    unit: over.groups.length || anyCapabilityLinks ? (over.groups.length === 1 ? "capability" : "capabilities") : undefined,
    pill: over.groups.length ? `${over.groups.length} overlap${over.groups.length === 1 ? "" : "s"}` : anyCapabilityLinks ? "None" : "Link capabilities",
    line: over.groups.length
      ? "Two or more tools doing the same job."
      : anyCapabilityLinks
        ? "No capability has two tools doing the same job."
        : "Link capabilities to the tools that provide them to spot overlaps.",
    open: { kind: "report", reportId: "overlaps", label: "Open" },
    preview: over.groups.slice(0, 3).map((group) => ({ name: group.name, tools: group.tools.map((tool) => tool.name) })),
    savings: over.savingsCents ? centsLabel(over.savingsCents) : "",
  });

  // Attention first: red, amber, then fine, then empty; stable within a tone.
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => TONE_RANK[a.card.tone] - TONE_RANK[b.card.tone] || a.index - b.index)
    .map(({ card }) => card);
}

export function attentionCount(cards: HubCard[]): number {
  return cards.filter((card) => card.tone === "red" || card.tone === "amber").length;
}
