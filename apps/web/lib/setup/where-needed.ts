/**
 * Wizard step 3 ("Where does each one live?") only asks about apps the add cards left open.
 *
 * Answered on the card (skipped here): linked to a host (tenant, server, platform), or SaaS /
 * people's computers. Still open (shown): not saved yet, nothing picked or "Don't know" (the card
 * saves both the same way, no hosting), "Our server" with no server linked, and "Our cloud" with no
 * tenant linked; step 3 can fill all of those.
 */
const ANSWERED_HOSTING = new Set(["saas", "cloud", "desktop"]);

type Obj = { id: string; properties?: unknown };
type Rel = { type: string; from_object_id: string };

export function needsWhere(app: { objectId?: string }, objects: Obj[], relationships: Rel[]): boolean {
  if (!app.objectId) return true;
  const object = objects.find((item) => item.id === app.objectId);
  if (!object) return true;
  if (relationships.some((rel) => (rel.type === "runs_on" || rel.type === "built_on") && rel.from_object_id === object.id)) return false;
  const hosting = (object.properties as { hosting_model?: unknown } | null | undefined)?.hosting_model;
  return !(typeof hosting === "string" && ANSWERED_HOSTING.has(hosting));
}

/** Keys of the apps step 3 should list; empty means skip the step. */
export function whereStepKeys<T extends { key: string; objectId?: string }>(apps: T[], objects: Obj[], relationships: Rel[]): string[] {
  return apps.filter((app) => needsWhere(app, objects, relationships)).map((app) => app.key);
}
