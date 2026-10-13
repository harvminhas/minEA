"use client";

import { Check, Plus } from "lucide-react";
import type { OrgRole } from "@minea/types";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { askPath } from "@/lib/mvp-paths";
import { orgLandingPath, roleLabel } from "@/lib/org-access";

export interface SwitcherOrg {
  slug: string;
  name: string;
  role: string;
}

export const NEW_ORG_PATH = "/onboarding";
export const NEW_ORG_LABEL = "Create new organisation";
export const NEW_WORKSPACE_LABEL = "New workspace";
export const MEMBER_WORKSPACE_HINT = "Only owners and admins can add workspaces";

/** Same rule the API enforces on POST /orgs/{slug}/workspaces (workspace.create: owner, admin). */
export function canCreateWorkspaceIn(role: string): boolean {
  return hasPermission("workspace.create", { orgRole: role as OrgRole });
}

/** Every org the user belongs to, with their role and its workspaces. Current org/workspace marked. */
export function OrgSwitcherMenu({
  orgs,
  workspacesByOrg,
  currentOrgSlug,
  currentWorkspaceSlug,
  onNavigate,
  workspaceBlocked,
}: {
  orgs: SwitcherOrg[];
  /** Plan limit for the current org (from billing status): replaces "+ New workspace" with the reason. */
  workspaceBlocked?: { message: string; planHref: string } | null;
  workspacesByOrg: Record<string, { slug: string; name: string }[] | undefined>;
  currentOrgSlug: string;
  currentWorkspaceSlug: string;
  onNavigate: (href: string) => void;
}) {
  // Current org first, then the rest by name.
  const ordered = [...orgs].sort((a, b) =>
    a.slug === currentOrgSlug ? -1 : b.slug === currentOrgSlug ? 1 : a.name.localeCompare(b.name)
  );
  return (
    <div data-testid="org-switcher-menu">
      {ordered.map((org, index) => {
        const current = org.slug === currentOrgSlug;
        const workspaces = workspacesByOrg[org.slug];
        return (
          <div key={org.slug} className={cn(index > 0 && "mt-1 border-t border-white/10 pt-1")} data-testid="org-switcher-org">
            <button
              type="button"
              onClick={() => onNavigate(orgLandingPath(org.slug, workspaces))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
              title={current ? "Current organisation" : `Switch to ${org.name}`}
            >
              <span className={cn("truncate text-[13px] font-semibold", current ? "text-white" : "text-white/70")}>{org.name}</span>
              <span
                data-testid="org-role-badge"
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-medium",
                  org.role === "owner" || org.role === "admin" ? "bg-indigo-500/25 text-indigo-200" : "bg-white/10 text-white/60"
                )}
              >
                {roleLabel(org.role)}
              </span>
              {current && <span className="ml-auto text-[10px] uppercase tracking-wider text-white/35">Current</span>}
            </button>
            {workspaces === undefined && <p className="px-3 py-1 pl-6 text-xs text-white/35">Loading workspaces…</p>}
            {workspaces?.length === 0 && <p className="px-3 py-1 pl-6 text-xs text-white/35">No workspaces</p>}
            {workspaces?.map((ws) => {
              const here = current && ws.slug === currentWorkspaceSlug;
              return (
                <button
                  key={ws.slug}
                  type="button"
                  aria-current={here ? "page" : undefined}
                  onClick={() => onNavigate(askPath(`/orgs/${org.slug}/workspaces/${ws.slug}`))}
                  className={cn(
                    "flex w-full items-center gap-2.5 py-1.5 pl-6 pr-3 text-left text-sm transition-colors",
                    here ? "bg-indigo-600/20 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-indigo-600 text-[10px] font-bold text-white">
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{ws.name}</span>
                  {here && <Check size={13} className="ml-auto text-indigo-400" />}
                </button>
              );
            })}
            {canCreateWorkspaceIn(org.role) ? (
              current && workspaceBlocked ? (
                <div className="py-1.5 pl-6 pr-3" data-testid="switcher-workspace-blocked">
                  <p className="text-[11px] leading-snug text-white/35">{workspaceBlocked.message}</p>
                  <button type="button" onClick={() => onNavigate(workspaceBlocked.planHref)} className="mt-1 text-[11px] text-indigo-300 hover:text-indigo-200">
                    View plan →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="switcher-new-workspace"
                  onClick={() => onNavigate(`/orgs/${org.slug}/workspaces/new`)}
                  className="flex w-full items-center gap-2.5 py-1.5 pl-6 pr-3 text-left text-sm text-indigo-300 hover:bg-white/5 hover:text-indigo-200"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-indigo-500/40">
                    <Plus size={12} />
                  </span>
                  <span>{NEW_WORKSPACE_LABEL}</span>
                </button>
              )
            ) : (
              current && (
                <p className="py-1 pl-6 pr-3 text-[11px] text-white/30" data-testid="switcher-member-hint">
                  {MEMBER_WORKSPACE_HINT}
                </p>
              )
            )}
          </div>
        );
      })}
      <div className="mt-1 border-t border-white/10 pt-1">
        <button
          type="button"
          data-testid="switcher-new-org"
          onClick={() => onNavigate(NEW_ORG_PATH)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-indigo-300 hover:bg-white/5 hover:text-indigo-200"
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-indigo-500/40">
            <Plus size={12} />
          </span>
          <span>{NEW_ORG_LABEL}</span>
        </button>
      </div>
    </div>
  );
}
