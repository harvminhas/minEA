import { isEstateViewsPath, isViewsModePath } from "@/lib/views";
import type { ViewMode } from "@/lib/store";

export type OrgShell = "embed" | "org" | "mvp" | "legacy";

/**
 * Which frame the org layout renders around a page.
 * - "org": org-level pages (org settings, new workspace, the not-admin message): no left sidebar,
 *   centred content. They used to fall through to the legacy shell, whose sidebar picks its
 *   content from the persisted viewMode, so a past visit to Views showed the dark Views sidebar.
 * - "legacy": only the old view pages (/views/<view>, e.g. Tech Stack) and the leftover split mode,
 *   which still use the Views sidebar on purpose.
 * - "mvp": every other workspace page (Ask, Model, Reports, Views, workspace settings).
 */
export function orgShellFor(pathname: string, viewMode: ViewMode): OrgShell {
  if (pathname.includes("/embed/")) return "embed";
  const workspacePage = /\/orgs\/[^/]+\/workspaces\/(?!new(\/|$))[^/]+/.test(pathname);
  if (!workspacePage) return "org";
  if (viewMode === "split") return "legacy";
  if (isViewsModePath(pathname) && !isEstateViewsPath(pathname)) return "legacy";
  return "mvp";
}
