/**
 * The four "where does it run?" choices for an app, shared by the add-apps wizard, Hosting &
 * location and the app record. Stored on application.properties.hosting_model (no migration):
 *   saas    → Cloud (SaaS), vendor-run
 *   own     → "on_premise" + a runs_on link to one of the org's servers
 *   desktop → "desktop" (installed on people's computers; no per-machine records)
 *   unknown → hosting_model cleared
 */
import { normalizeTerm } from "@/lib/setup/match-tools";

export type LocationChoice = "saas" | "own" | "desktop" | "unknown";

export const LOCATION_CHOICES: { choice: LocationChoice; label: string; hint: string }[] = [
  { choice: "saas", label: "Cloud (SaaS)", hint: "Run by the vendor" },
  { choice: "own", label: "Our server", hint: "Pick or add the server" },
  { choice: "desktop", label: "On people's computers", hint: "Installed desktop software" },
  { choice: "unknown", label: "Don't know", hint: "Leave it for later" },
];

/** Show the search box once the list is longer than this. */
export const SERVER_SEARCH_AFTER = 6;

export function hostingForChoice(choice: LocationChoice): "saas" | "on_premise" | "desktop" | null {
  if (choice === "saas") return "saas";
  if (choice === "own") return "on_premise";
  if (choice === "desktop") return "desktop";
  return null;
}

/**
 * The chip comes from hosting_model alone (the single source of truth). A runs-on link only names
 * the server for "Our server"; it never overrides hosting_model.
 */
export function choiceFromApp(hosting: unknown): LocationChoice {
  if (hosting === "saas" || hosting === "cloud") return "saas";
  if (hosting === "desktop") return "desktop";
  if (hosting === "on_premise") return "own";
  return "unknown";
}

/**
 * What a chip click changes on the server, given the app's current runs-on links to servers.
 * Leaving "Our server" (or re-clicking a choice while stray server links remain) removes those
 * links; with more than one link the caller asks first.
 */
export function planLocationChange(
  current: { hosting: unknown; serverLinks: { id: string; serverId: string }[] },
  next: { choice: Exclude<LocationChoice, "own"> } | { choice: "own"; serverId: string },
): { hosting: "saas" | "on_premise" | "desktop" | null; addServerId: string | null; removeLinkIds: string[]; needsConfirm: boolean } {
  const hosting = hostingForChoice(next.choice);
  if (next.choice === "own") {
    const has = current.serverLinks.some((link) => link.serverId === next.serverId);
    // Switching servers replaces the one link the chip set; several links are left alone.
    const removeLinkIds = current.serverLinks.length === 1 && !has ? [current.serverLinks[0]!.id] : [];
    return { hosting, addServerId: has ? null : next.serverId, removeLinkIds, needsConfirm: false };
  }
  const removeLinkIds = current.serverLinks.map((link) => link.id);
  return { hosting, addServerId: null, removeLinkIds, needsConfirm: removeLinkIds.length > 1 };
}

export type ServerOption = { id?: string; name: string };

/** Case-insensitive, punctuation-insensitive match: the record to reuse instead of a duplicate. */
export function findServer<T extends ServerOption>(servers: T[], name: string): T | undefined {
  const key = normalizeTerm(name);
  return key ? servers.find((server) => normalizeTerm(server.name) === key) : undefined;
}

export function filterServers<T extends ServerOption>(servers: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  const sorted = [...servers].sort((a, b) => a.name.localeCompare(b.name));
  return needle ? sorted.filter((server) => server.name.toLowerCase().includes(needle)) : sorted;
}
