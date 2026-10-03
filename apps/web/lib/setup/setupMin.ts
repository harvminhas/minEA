/** The only place the first-run minimum is defined. */
export const SETUP_MIN = { apps: 5, hostingLinks: 1 };

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
  hostingLinks: number;
  met: boolean;
};

const APP_TYPES = new Set(["application"]);

export function setupState(
  objects: { type: string }[],
  relationships: { type: string }[],
): SetupState {
  const apps = objects.filter((object) => APP_TYPES.has(object.type)).length;
  const hostingLinks = relationships.filter((rel) => rel.type === "runs_on" || rel.type === "built_on").length;
  return {
    apps,
    hostingLinks,
    met: apps >= SETUP_MIN.apps && hostingLinks >= SETUP_MIN.hostingLinks,
  };
}

/** One sentence for Ask, Views, Reports, and Model. */
export function setupGapLine(state: SetupState): string {
  const appsShort = Math.max(0, SETUP_MIN.apps - state.apps);
  const needLink = state.hostingLinks < SETUP_MIN.hostingLinks;
  if (appsShort === 0 && !needLink) return "";
  if (appsShort > 0 && needLink) {
    const apps = appsShort === 1 ? "Add 1 more app" : `Add ${appsShort} more apps`;
    const link = appsShort === 1 ? "link it to a server" : "link one to a server";
    return `${apps} and ${link} to see your reports.`;
  }
  if (appsShort === 1) return "Add 1 more app to see your reports.";
  if (appsShort > 1) return `Add ${appsShort} more apps to see your reports.`;
  return "Link one app to a server to see your reports.";
}

export function setupMeter(apps: number, linked: number): string {
  const appLabel = apps === 1 ? "1 app" : `${apps} apps`;
  const linkLabel = linked === 1 ? "1 app linked to a server" : `${linked} apps linked to a server`;
  return `${appLabel} · ${linkLabel}`;
}
