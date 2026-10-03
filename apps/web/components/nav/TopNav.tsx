"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Bell, HelpCircle, LogOut, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelPath, reportsPath } from "@/lib/mvp-paths";
import { ASK_BAR_ID, askShortcut, stripSplitUrl } from "@/components/nav/ask-shortcut";
import { useQuery } from "@tanstack/react-query";
import { billingApi, orgsApi, workspacesApi } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import { workspaceCreateBlockedMessage } from "@/lib/plan-features";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { ArchitectureInsightsPanel } from "@/components/insights/ArchitectureInsightsPanel";
import { useArchitectureInsights } from "@/lib/use-architecture-insights";

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
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

  // The header no longer opens side-by-side. Split layout code is still mounted from
  // the org layout when viewMode is "split" (persisted). Exit it here so a removed
  // button cannot leave someone stuck. Still used by: app/orgs/[orgSlug]/layout.tsx,
  // components/sidebar/SplitViewPanel.tsx, components/sidebar/ResizableSplitLayout.tsx,
  // lib/store.ts, lib/view-embed-context.tsx, lib/last-app-path.ts, app/home/page.tsx.
  // TODO: remove that layout if nothing else sets viewMode to "split".
  useEffect(() => {
    if (viewMode === "split") setViewMode("repository");
  }, [viewMode, setViewMode]);

  useEffect(() => {
    const next = stripSplitUrl(pathname, window.location.search);
    if (next) router.replace(next);
  }, [pathname, router]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = askShortcut(event, pathname, basePath);
      if (!action) return;
      event.preventDefault();
      if (action.type === "focus") {
        document.getElementById(ASK_BAR_ID)?.focus();
        return;
      }
      router.push(action.href);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pathname, basePath, router]);

  useEffect(() => {
    if (!window.location.search.includes("focus=ask")) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const bar = document.getElementById(ASK_BAR_ID);
      if (bar instanceof HTMLElement) {
        bar.focus();
        window.clearInterval(timer);
        const url = new URL(window.location.href);
        url.searchParams.delete("focus");
        const query = url.searchParams.toString();
        router.replace(query ? `${url.pathname}?${query}` : url.pathname);
        return;
      }
      if (Date.now() - started > 4000) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, router]);

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
    <header className="fixed top-0 left-0 right-0 h-14 bg-[#0f172a] border-b border-white/10 flex items-center px-4 gap-3 z-50">
      {/* Logo */}
      <Link
        href={orgSlug && workspaceSlug ? askPath(basePath) : "/home"}
        onClick={() => setViewMode("repository")}
        className="flex-shrink-0 mr-1"
      >
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
                    router.push(askPath(`/orgs/${orgSlug}/workspaces/${ws.slug}`));
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
        <div className="flex items-center gap-0.5 rounded-lg bg-white/8 border border-white/10 p-0.5 flex-shrink-0">
          {(
            [
              { id: "ask", label: "Ask", href: askPath(basePath) },
              { id: "model", label: "Model", href: modelPath(basePath, "overview") },
              { id: "views", label: "Views", href: `${basePath}/views` },
              { id: "reports", label: "Reports", href: reportsPath(basePath) },
            ] as const
          ).map((tab) => {
            const inModel =
              !pathname.includes("/ask") &&
              !pathname.includes("/reports") &&
              (!pathname.includes("/views") || pathname.includes("/views/processes"));
            const selected = tab.id === "views"
              ? pathname.includes("/views") && !pathname.includes("/views/processes")
              : tab.id === "ask"
                ? pathname.includes("/ask")
                : tab.id === "reports"
                  ? pathname.includes("/reports")
                  : inModel;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                onClick={() => setViewMode(tab.id === "views" ? "views" : "repository")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-medium transition-colors",
                  selected ? "bg-[#5b4ce6] text-white" : "text-white/55 hover:text-white hover:bg-white/8"
                )}
              >
                {tab.label}
              </Link>
            );
            })}
        </div>
      )}

      {/* Right actions. Needs attention count is not built; the slot is the gap before the avatar. */}
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
