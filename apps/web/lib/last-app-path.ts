import type { Org } from "@minea/types";
import { workspacesApi } from "@/lib/api-client";
import type { ViewMode } from "@/lib/store";
import { isViewsAreaPath, primaryViewPath, viewIdFromPathname } from "@/lib/views";

export interface PostLoginDestination {
  destination: string;
  restored: boolean;
}

const ORG_PATH = /^\/orgs\/([^/]+)(?:\/workspaces\/([^/]+)(\/.*)?)?$/;

/** Paths we remember as the user's last in-app location. */
export function isTrackableAppPath(pathname: string): boolean {
  if (!pathname.startsWith("/orgs/")) return false;
  if (pathname.includes("/embed/")) return false;
  return true;
}

export function parseAppPath(path: string): {
  orgSlug: string;
  workspaceSlug: string | null;
  pathname: string;
} | null {
  const [pathname] = path.split("?");
  const match = pathname.match(ORG_PATH);
  if (!match) return null;
  return {
    orgSlug: match[1]!,
    workspaceSlug: match[2] ?? null,
    pathname,
  };
}

export function pathOnly(path: string): string {
  return path.split("?")[0]!;
}

function isWorkspaceHomePath(pathname: string): boolean {
  const parsed = parseAppPath(pathname);
  if (!parsed?.workspaceSlug) return false;
  const base = `/orgs/${parsed.orgSlug}/workspaces/${parsed.workspaceSlug}`;
  return parsed.pathname === base;
}

/** Align top-nav mode (Repository / Views / Split) with the restored route. */
export function inferViewModeForPath(path: string, persistedMode: ViewMode): ViewMode {
  const pathname = pathOnly(path);
  if (isViewsAreaPath(pathname)) return "views";
  if (isWorkspaceHomePath(pathname) && persistedMode === "split") return "split";
  return "repository";
}

export function splitViewIdForPath(path: string) {
  return viewIdFromPathname(pathOnly(path));
}

export async function resolvePostLoginDestination(opts: {
  orgs: Org[];
  lastAppPath: string | null;
  getToken: () => Promise<string | null>;
}): Promise<PostLoginDestination> {
  const { orgs, lastAppPath, getToken } = opts;

  if (orgs.length === 0) return { destination: "/onboarding", restored: false };

  const fallback = async (): Promise<PostLoginDestination> => {
    const org = orgs[0]!;
    const token = await getToken();
    if (!token) return { destination: "/home", restored: false };
    const workspaces = await workspacesApi.list(org.slug, token);
    const ws = workspaces[0];
    if (ws) return { destination: primaryViewPath(org.slug, ws.slug), restored: false };
    return { destination: `/orgs/${org.slug}/settings`, restored: false };
  };

  if (!lastAppPath) return fallback();

  const parsed = parseAppPath(lastAppPath);
  if (!parsed || !isTrackableAppPath(parsed.pathname)) return fallback();

  const org = orgs.find((o) => o.slug === parsed.orgSlug);
  if (!org) return fallback();

  if (!parsed.workspaceSlug) {
    return { destination: lastAppPath, restored: true };
  }

  const token = await getToken();
  if (!token) return fallback();

  const workspaces = await workspacesApi.list(org.slug, token);
  if (!workspaces.some((w) => w.slug === parsed.workspaceSlug)) {
    return fallback();
  }

  return { destination: lastAppPath, restored: true };
}
