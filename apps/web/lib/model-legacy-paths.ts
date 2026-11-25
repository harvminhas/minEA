/** Canonical Model URLs after the sidebar regroup, plus helpers for old list URLs. */

import { modelPath } from "@/lib/mvp-paths";

export type ConnectionsType = "flows" | "apis" | "events" | "tools";

export const CONNECTIONS_TYPE_LABEL: Record<ConnectionsType, string> = {
  flows: "Flows",
  apis: "APIs",
  events: "Events",
  tools: "Integration infra",
};

export const INTEGRATION_PATH_TO_TYPE: Record<string, ConnectionsType> = {
  flows: "flows",
  apis: "apis",
  events: "events",
  tools: "tools",
};

export function connectionsPath(basePath: string, type?: ConnectionsType | "all" | null, open?: string | null): string {
  const params = new URLSearchParams();
  if (type && type !== "all") params.set("type", type);
  if (open) params.set("open", open);
  const query = params.toString();
  return `${modelPath(basePath, "connections")}${query ? `?${query}` : ""}`;
}

export function applicationsPath(basePath: string, opts?: { tab?: "applications" | "ai"; aiType?: "agents" | "models" }): string {
  const params = new URLSearchParams();
  if (opts?.tab === "ai") params.set("tab", "ai");
  if (opts?.aiType) params.set("ai", opts.aiType);
  const query = params.toString();
  return `${modelPath(basePath, "applications")}${query ? `?${query}` : ""}`;
}

export function platformsPath(basePath: string, tab?: "platforms" | "locations"): string {
  const params = new URLSearchParams();
  if (tab === "locations") params.set("tab", "locations");
  const query = params.toString();
  return `${modelPath(basePath, "platforms")}${query ? `?${query}` : ""}`;
}

/** Map an old list pathname + search onto the new page. Returns null if this URL should stay as-is (e.g. a record). */
export function legacyListRedirect(basePath: string, pathname: string, search = ""): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const open = params.get("open");

  if (pathname.endsWith("/model/agents") || pathname.includes("/model/agents?")) {
    return applicationsPath(basePath, { tab: "ai", aiType: "agents" });
  }
  if (pathname.endsWith("/model/ai-models") || pathname.includes("/model/ai-models?")) {
    return applicationsPath(basePath, { tab: "ai", aiType: "models" });
  }
  if (pathname.endsWith("/model/locations") || pathname.includes("/model/locations?")) {
    return platformsPath(basePath, "locations");
  }

  const integration = pathname.match(/\/integration\/(flows|apis|events|tools)\/?$/);
  if (integration) {
    const type = INTEGRATION_PATH_TO_TYPE[integration[1]!];
    return connectionsPath(basePath, type, open);
  }
  return null;
}
