"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/nav/TopNav";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ResizableSplitLayout } from "@/components/sidebar/ResizableSplitLayout";
import { useAppStore } from "@/lib/store";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { GlobalRefetchIndicator } from "@/components/ui/GlobalRefetchIndicator";
import { isEstateViewsPath, isViewsAreaPath, isViewsModePath, viewIdFromPathname } from "@/lib/views";
import { MvpFrame } from "@/components/mvp/MvpFrame";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const router = useRouter();
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

  const { data: org, isError, isFetched } = useQuery({
    queryKey: ["org", orgSlug],
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

  useEffect(() => {
    if (!isOrgOnlyRoute || activeWorkspace?.slug || !workspaces?.length) return;
    const defaultWs = workspaces.find((w) => w.slug === "default") ?? workspaces[0]!;
    setActiveWorkspace(defaultWs);
  }, [isOrgOnlyRoute, activeWorkspace?.slug, workspaces, setActiveWorkspace]);

  useEffect(() => {
    if (isFetched && isError) {
      setActiveOrg(null);
      router.replace("/home");
    }
  }, [isFetched, isError, router, setActiveOrg]);

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
        <div className="min-h-screen bg-gray-50">{children}</div>
      </RequireAuth>
    );
  }

  const sidebarW = sidebarExpanded ? "ml-[200px]" : "ml-[52px]";
  const bgClass = "bg-gray-50";
  const mvpShell =
    pathname.includes("/workspaces/") &&
    !isEmbed &&
    viewMode !== "split" &&
    (!isViewsModePath(pathname) || isEstateViewsPath(pathname));

  return (
    <RequireAuth>
      <GlobalRefetchIndicator />
      <div className={`h-screen overflow-hidden ${bgClass}`}>
        <TopNav />
        <div className="flex h-full pt-14">
          {mvpShell ? (
            <MvpFrame>{children}</MvpFrame>
          ) : (
            <>
              <AppSidebar />
              {viewMode === "split" ? (
                <div className={`flex flex-1 ${sidebarW} overflow-hidden`}>
                  <ResizableSplitLayout>{children}</ResizableSplitLayout>
                </div>
              ) : (
                <main className={`flex-1 ${sidebarW} overflow-y-auto`}>{children}</main>
              )}
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
