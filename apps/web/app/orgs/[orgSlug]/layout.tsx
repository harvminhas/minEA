"use client";

import { MEMBERSHIP_QUERY, invalidateMembership } from "@/lib/membership-freshness";
import { useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopNav } from "@/components/nav/TopNav";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ResizableSplitLayout } from "@/components/sidebar/ResizableSplitLayout";
import { useAppStore } from "@/lib/store";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { GlobalRefetchIndicator } from "@/components/ui/GlobalRefetchIndicator";
import { isViewsAreaPath, viewIdFromPathname } from "@/lib/views";
import { orgShellFor } from "@/lib/app-shell";
import { MvpFrame } from "@/components/mvp/MvpFrame";
import { OrgLoadError } from "@/components/org/OrgNotices";
import { orgLoadErrorMessage } from "@/lib/org-access";
import { useForgetGone } from "@/lib/use-forget-gone";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const {
    setActiveOrg,
    setActiveWorkspace,
    activeWorkspace,
    viewMode,
    setViewMode,
    sidebarExpanded,
    setSplitViewId,
  } = useAppStore();
  const queryEnabled = useAuthQueryEnabled(orgSlug);
  const isEmbed = pathname.includes("/embed/");
  const isOrgOnlyRoute = !!orgSlug && !pathname.includes("/workspaces/");

  const { data: org, isError, isFetched, error: orgLoadError, refetch: refetchOrg, isFetching: orgFetching } = useQuery({
    queryKey: ["org", orgSlug],
    ...MEMBERSHIP_QUERY,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return orgsApi.get(orgSlug, token);
    },
    enabled: queryEnabled,
    retry: false,
  });

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return workspacesApi.list(orgSlug, token);
    },
    enabled: queryEnabled && isOrgOnlyRoute && !activeWorkspace?.slug,
  });

  useEffect(() => {
    if (org) setActiveOrg(org);
  }, [org, setActiveOrg]);

  // Each in-app navigation re-reads this org's role from the API, so a promotion (or demotion)
  // shows on the next click instead of after sign-out. Skips the first render (the query is
  // already fetching then).
  const queryClient = useQueryClient();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current !== null && lastPath.current !== pathname) void invalidateMembership(queryClient, orgSlug);
    lastPath.current = pathname;
  }, [pathname, orgSlug, queryClient]);

  useEffect(() => {
    if (!isOrgOnlyRoute || activeWorkspace?.slug || !workspaces?.length) return;
    const defaultWs = workspaces.find((w) => w.slug === "default") ?? workspaces[0]!;
    setActiveWorkspace(defaultWs);
  }, [isOrgOnlyRoute, activeWorkspace?.slug, workspaces, setActiveWorkspace]);

  // A failed org fetch shows an error with retry in place of the page. It used to go to /home,
  // which then opened orgs[0]'s Ask: a silent jump to another org.
  const orgLoadFailed = isFetched && isError && !org;
  // 403/404: the org is gone (erased, deleted, or we were removed). Forget it and go to /home once.
  const leavingGoneOrg = useForgetGone({ failed: orgLoadFailed, error: orgLoadError, orgSlug });
  const content = leavingGoneOrg ? null : orgLoadFailed ? (
    <OrgLoadError message={orgLoadErrorMessage(orgLoadError)} onRetry={() => void refetchOrg()} retrying={orgFetching} />
  ) : (
    children
  );

  // Keep top-nav mode aligned when landing on a views URL (e.g. restore last location).
  useEffect(() => {
    if (!pathname.includes("/workspaces/") || viewMode === "split") return;
    if (isViewsAreaPath(pathname) && viewMode !== "views") {
      setViewMode("views");
    }
  }, [pathname, viewMode, setViewMode]);

  // Split mode used to send Views back to the workspace root, which then opens Ask.
  // Stay on the page the top tab opened.
  useEffect(() => {
    if (viewMode !== "split" || !pathname.includes("/workspaces/")) return;
    if (!isViewsAreaPath(pathname)) return;
    const activeViewId = viewIdFromPathname(pathname);
    if (activeViewId) setSplitViewId(activeViewId);
    setViewMode("views");
  }, [viewMode, pathname, setSplitViewId, setViewMode]);

  if (isEmbed) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-gray-50">{content}</div>
      </RequireAuth>
    );
  }

  const sidebarW = sidebarExpanded ? "ml-[200px]" : "ml-[52px]";
  const bgClass = "bg-gray-50";
  const shell = orgShellFor(pathname, viewMode);

  return (
    <RequireAuth>
      <GlobalRefetchIndicator />
      <div className={`h-screen overflow-hidden ${bgClass}`}>
        <TopNav />
        <div className="flex h-full pt-14">
          {shell === "org" ? (
            <main data-shell="org" className="flex-1 overflow-y-auto">{content}</main>
          ) : shell === "mvp" ? (
            <MvpFrame>{content}</MvpFrame>
          ) : (
            <>
              <AppSidebar />
              {viewMode === "split" ? (
                <div className={`flex flex-1 ${sidebarW} overflow-hidden`}>
                  <ResizableSplitLayout>{content}</ResizableSplitLayout>
                </div>
              ) : (
                <main className={`flex-1 ${sidebarW} overflow-y-auto`}>{content}</main>
              )}
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
