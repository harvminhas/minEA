/** Workspace paths for the Ask / Reports / Model shell. */

export function askPath(basePath: string, query?: string, focusId?: string): string {
  if (!query?.trim()) return `${basePath}/ask`;
  const path = `${basePath}/ask/answer?q=${encodeURIComponent(query.trim())}`;
  return focusId ? `${path}&focus=${encodeURIComponent(focusId)}` : path;
}

export function reportsPath(basePath: string): string {
  return `${basePath}/reports`;
}

export function reportPath(basePath: string, reportId: string): string {
  return `${basePath}/reports/${reportId}`;
}

export type ModelSection =
  | "overview"
  | "applications"
  | "platforms"
  | "servers"
  | "locations"
  | "infrastructure"
  | "connections"
  | "vendors"
  | "owners";

export const MODEL_SECTIONS: ModelSection[] = [
  "overview",
  "applications",
  "platforms",
  "servers",
  "locations",
  "infrastructure",
  "connections",
  "vendors",
  "owners",
];

export function sectionForKind(kind: "application" | "runtime" | "platform"): ModelSection {
  if (kind === "application") return "applications";
  if (kind === "platform") return "platforms";
  return "servers";
}

export function isModelSection(value: string): value is ModelSection {
  return (MODEL_SECTIONS as string[]).includes(value);
}

export function modelPath(basePath: string, section: ModelSection = "overview"): string {
  return `${basePath}/model/${section}`;
}

export function modelItemPath(basePath: string, section: ModelSection, id: string): string {
  return `${basePath}/model/${section}/${id}`;
}
