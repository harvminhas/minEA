/** The only place the first-run minimum is defined. */
export const SETUP_MIN = { apps: 5, located: 1 };

/**
 * Where an app lives (application.properties.hosting_model). The wizard, Hosting & location and the
 * app record all offer the same four choices:
 *   Cloud (SaaS) → "saas" · Our server → "on_premise" + a runs_on link · On people's computers →
 *   "desktop" · Don't know → no value.
 * An app has a KNOWN LOCATION when it runs on / is built on something, or is Cloud or desktop.
 * "on_premise" alone doesn't count: "Our server" is only known once a server is picked.
 */
export const KNOWN_LOCATION_HOSTING = new Set(["saas", "cloud", "desktop"]);

/** Share of a typed list that must already be known before Ask treats it as an add. */
export const ADD_KNOWN_SHARE = 0.6;

/** A line that starts with one of these is a question, unless it leads with add, new, or +. */
export const QUESTION_WORDS = [
  "what",
  "who",
  "which",
  "when",
  "where",
  "why",
  "how",
  "is",
  "are",
  "does",
  "do",
  "can",
  "should",
  "show",
  "list",
] as const;

export type SetupState = {
  apps: number;
  located: number;
  met: boolean;
};

const APP_TYPES = new Set(["application"]);

export function setupState(
  objects: { id?: string; type: string; properties?: unknown }[],
  relationships: { type: string; from_object_id?: string }[],
): SetupState {
  const appObjects = objects.filter((object) => APP_TYPES.has(object.type));
  const apps = appObjects.length;
  const hosted = new Set(
    relationships.filter((rel) => rel.type === "runs_on" || rel.type === "built_on").map((rel) => rel.from_object_id),
  );
  const located = appObjects.filter((app) => {
    if (app.id && hosted.has(app.id)) return true;
    const hosting = (app.properties as { hosting_model?: unknown } | undefined)?.hosting_model;
    return typeof hosting === "string" && KNOWN_LOCATION_HOSTING.has(hosting);
  }).length;
  return {
    apps,
    located,
    met: apps >= SETUP_MIN.apps && located >= SETUP_MIN.located,
  };
}

/** One sentence for Ask, Views, Reports, and Model. */
export function setupGapLine(state: SetupState): string {
  const appsShort = Math.max(0, SETUP_MIN.apps - state.apps);
  const needLink = state.located < SETUP_MIN.located;
  if (appsShort === 0 && !needLink) return "";
  if (appsShort > 0 && needLink) {
    const apps = appsShort === 1 ? "Add 1 more app" : `Add ${appsShort} more apps`;
    const link = appsShort === 1 ? "say where it runs" : "say where one runs";
    return `${apps} and ${link} to see your reports.`;
  }
  if (appsShort === 1) return "Add 1 more app to see your reports.";
  if (appsShort > 1) return `Add ${appsShort} more apps to see your reports.`;
  return "Say where one app runs to see your reports.";
}

export function setupMeter(apps: number, linked: number): string {
  const appLabel = apps === 1 ? "1 app" : `${apps} apps`;
  const linkLabel = linked === 1 ? "1 app with a known location" : `${linked} apps with a known location`;
  return `${appLabel} · ${linkLabel}`;
}

export type SetupCardHeader =
  | { mode: "example" }
  | {
      mode: "progress";
      /** Apps are met; only a known location is missing. The CTA becomes "Say where an app runs". */
      onlyLink: boolean;
      title: string;
      progressLine: string;
      percent: number;
      savedLine: string;
    };

/**
 * Header for the setup card over sample screens. "Example data" + sample wording only while the
 * wizard is closed AND there are no real apps; otherwise it's the person's own progress, saved.
 * Counts are clamped ("6 apps ✓", never "6 of 5"); the bar weighs both requirements equally and
 * never passes 100%.
 */
export function setupCardHeader(state: Pick<SetupState, "apps" | "located">, wizardOpen: boolean): SetupCardHeader {
  if (!wizardOpen && state.apps < 1) return { mode: "example" };
  const appsMet = state.apps >= SETUP_MIN.apps;
  const linksMet = state.located >= SETUP_MIN.located;
  const appsPart = appsMet ? `${state.apps} apps ✓` : `${state.apps} of ${SETUP_MIN.apps} apps`;
  const linkPart = linksMet
    ? `${state.located} with a known location ✓`
    : `${state.located} of ${SETUP_MIN.located} with a known location`;
  const share = (have: number, need: number) => Math.min(1, Math.max(0, have) / need);
  const percent = Math.round(((share(state.apps, SETUP_MIN.apps) + share(state.located, SETUP_MIN.located)) / 2) * 100);
  const onlyLink = appsMet && !linksMet;
  return {
    mode: "progress",
    onlyLink,
    title: onlyLink ? "Last step: tell us where one app runs" : "Setting up your map",
    progressLine: `${appsPart} · ${linkPart}`,
    percent,
    savedLine: onlyLink
      ? "Your entries are saved to your workspace. Pick where one app runs (cloud, our server or people’s computers); reports unlock right after."
      : `Your entries are saved to your workspace. Reports unlock at ${SETUP_MIN.apps} apps and ${SETUP_MIN.located} app with a known location.`,
  };
}
