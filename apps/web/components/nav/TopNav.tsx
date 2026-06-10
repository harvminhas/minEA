"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Bell, HelpCircle, Search, LogOut, Settings, BookOpen, LayoutTemplate, Columns2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAppStore, type ViewMode } from "@/lib/store";
import { useTenancy, primaryViewPath } from "@/lib/tenancy";
import { useQuery } from "@tanstack/react-query";
import { billingApi, orgsApi, workspacesApi } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import { workspaceCreateBlockedMessage } from "@/lib/plan-features";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { ArchitectureInsightsPanel } from "@/components/insights/ArchitectureInsightsPanel";
import { useArchitectureInsights } from "@/lib/use-architecture-insights";

export function TopNav() {
  const router = useRouter();
  const { getToken, user, signOut } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { activeOrg, activeWorkspace, viewMode, setViewMode } = useAppStore();

  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const insights = useArchitectureInsights(orgSlug ?? "", workspaceSlug ?? "");
  const { canCreateWorkspace } = usePermissions();

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.get(orgSlug, token!);
    },
    enabled: !!orgSlug,
  });

  const { data: workspaces, isLoading: workspacesLoading } = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.list(orgSlug, token!);
    },
    enabled: !!orgSlug,
  });

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return billingApi.status(orgSlug, token!);
    },
    enabled: !!orgSlug && canCreateWorkspace,
  });

  const canCreateOwnWorkspace =
    canCreateWorkspace && (billingStatus?.can_create_own_workspace ?? true);

  const orgName = org?.name ?? activeOrg?.name ?? orgSlug;
  const wsName =
    activeWorkspace?.name ??
    workspaces?.find((w) => w.slug === workspaceSlug)?.name ??
    workspaceSlug;

  const initials = (user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-[#0f172a] border-b border-white/10 flex items-center px-4 gap-3 z-50">
      {/* Logo */}
      <Link href="/home" className="flex-shrink-0 mr-1">
        <BuboMapWordmark size="sm" beta theme="dark" />
      </Link>

      {/* Org / Workspace breadcrumb */}
      {orgSlug && (
        <div className="relative flex-shrink-0" ref={wsRef}>
          <button
            type="button"
            onClick={() => setWsOpen((o) => !o)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-white/10 transition-colors"
          >
            <span className="text-white/50 font-medium">{orgName}</span>
            <span className="text-white/25 mx-0.5">/</span>
            <span className="text-white font-semibold">{wsName ?? "—"}</span>
            <ChevronDown
              size={13}
              className={cn("text-white/40 ml-1 transition-transform", wsOpen && "rotate-180")}
            />
          </button>

          {wsOpen && (
            <div className="absolute left-0 top-full mt-1.5 min-w-[200px] bg-[#1e293b] border border-white/10 rounded-lg shadow-2xl z-50 py-1.5 overflow-hidden">
              <p className="px-3 pb-1 pt-0.5 text-[10px] text-white/30 uppercase tracking-wider font-medium">
                {orgName}
              </p>
              {workspacesLoading && (
                <p className="px-3 py-2 text-xs text-white/40">Loading workspaces…</p>
              )}
              {(workspaces ?? []).map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    router.push(primaryViewPath(orgSlug, ws.slug));
                    setWsOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm transition-colors",
                    ws.slug === workspaceSlug
                      ? "bg-indigo-600/20 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <span className="h-5 w-5 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{ws.name}</span>
                  {ws.slug === workspaceSlug && (
                    <span className="ml-auto text-indigo-400 text-xs">✓</span>
                  )}
                </button>
              ))}
              {canCreateWorkspace && (
                <>
                  {(workspaces ?? []).length > 0 && (
                    <div className="my-1.5 border-t border-white/10" />
                  )}
                  {canCreateOwnWorkspace ? (
                    <Link
                      href={`/orgs/${orgSlug}/workspaces/new`}
                      onClick={() => setWsOpen(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-indigo-300 hover:text-indigo-200 hover:bg-white/5 transition-colors"
                    >
                      <span className="h-5 w-5 rounded border border-indigo-500/40 flex items-center justify-center flex-shrink-0">
                        <Plus size={12} />
                      </span>
                      <span>Create New</span>
                    </Link>
                  ) : (
                    <div className="px-3 py-2">
                      <p className="text-[11px] text-white/35 leading-snug">
                        {workspaceCreateBlockedMessage(
                          billingStatus?.plan,
                          billingStatus?.own_workspace_limit
                        )}
                      </p>
                      <Link
                        href={`/orgs/${orgSlug}/settings`}
                        onClick={() => setWsOpen(false)}
                        className="mt-1.5 inline-block text-[11px] text-indigo-300 hover:text-indigo-200"
                      >
                        View plan →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* View Mode Toggle — only when inside a workspace */}
      {workspaceSlug && (
        <div className="flex items-center gap-0.5 rounded-md bg-white/8 border border-white/10 p-0.5 flex-shrink-0">
          {(
            [
              { mode: "repository" as ViewMode, label: "Repository", icon: BookOpen },
              { mode: "split"       as ViewMode, label: "Split",      icon: Columns2 },
              { mode: "views"       as ViewMode, label: "Views",      icon: LayoutTemplate },
            ] as const
          ).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setViewMode(mode);
                if (!basePath) return;
                if (mode === "views") {
                  router.push(`${basePath}/views`);
                } else if (mode === "repository") {
                  router.push(basePath);
                }
              }}
              title={label}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                viewMode === mode
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-white/45 hover:text-white/80 hover:bg-white/8"
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="flex-1 flex justify-center px-4">
        <button
          type="button"
          className="flex items-center gap-2 w-full max-w-md rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white/35 hover:bg-white/8 hover:border-white/20 hover:text-white/55 transition-colors"
        >
          <Search size={13} className="flex-shrink-0" />
          <span>Search or jump to...</span>
          <kbd className="ml-auto text-[10px] bg-white/10 rounded px-1.5 py-0.5 text-white/30 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
        <button
          type="button"
          title="Architecture insights"
          onClick={() => workspaceSlug && setInsightsOpen(true)}
          className="relative p-2 text-white/40 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
        >
          <Bell size={16} />
          {insights.badgeCount > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white",
                insights.criticalOnly ? "bg-red-500" : "bg-amber-500"
              )}
            >
              {insights.badgeCount > 9 ? "9+" : insights.badgeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          title="Help"
          className="p-2 text-white/40 hover:text-white/80 hover:bg-white/10 rounded-md transition-colors"
        >
          <HelpCircle size={16} />
        </button>

        {/* User avatar + dropdown */}
        <div className="relative ml-1" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserOpen((o) => !o)}
            className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            {initials}
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-[200px] bg-[#1e293b] border border-white/10 rounded-lg shadow-2xl z-50 py-1.5 overflow-hidden">
              {user && (
                <div className="px-3 py-2 border-b border-white/10 mb-1">
                  <p className="text-xs font-medium text-white/80 truncate">
                    {user.displayName ?? user.email}
                  </p>
                  <p className="text-[11px] text-white/40 truncate">{user.email}</p>
                </div>
              )}
              {orgSlug && (
                <Link
                  href={`/orgs/${orgSlug}/settings`}
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Settings size={13} />
                  Org settings
                </Link>
              )}
              <button
                type="button"
                onClick={() => signOut().then(() => { window.location.href = "/"; })}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {workspaceSlug && (
        <ArchitectureInsightsPanel
          open={insightsOpen}
          onClose={() => setInsightsOpen(false)}
          insights={insights.insights}
          count={insights.count}
          analysedAt={insights.analysedAt}
          isLoading={insights.isLoading}
          isGenerating={insights.isGenerating}
          onRefresh={insights.refresh}
        />
      )}
    </header>
  );
}
