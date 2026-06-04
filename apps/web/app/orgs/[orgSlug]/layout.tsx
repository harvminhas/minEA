"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/nav/TopNav";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ResizableSplitLayout } from "@/components/sidebar/ResizableSplitLayout";
import { useAppStore } from "@/lib/store";
import { orgsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { GlobalRefetchIndicator } from "@/components/ui/GlobalRefetchIndicator";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const { setActiveOrg, viewMode, sidebarExpanded } = useAppStore();
  const queryEnabled = useAuthQueryEnabled(orgSlug);
  const isEmbed = pathname.includes("/embed/");

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return orgsApi.get(orgSlug, token);
    },
    enabled: queryEnabled,
  });

  useEffect(() => {
    if (org) setActiveOrg(org);
  }, [org, setActiveOrg]);

  if (isEmbed) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-gray-50">{children}</div>
      </RequireAuth>
    );
  }

  const sidebarW = sidebarExpanded ? "ml-[200px]" : "ml-[52px]";
  const bgClass = viewMode === "views" ? "bg-violet-50" : "bg-gray-50";

  return (
    <RequireAuth>
      <GlobalRefetchIndicator />
      <div className={`h-screen overflow-hidden ${bgClass}`}>
        <TopNav />
        <div className="flex h-full pt-12">
          <AppSidebar />
          {viewMode === "split" ? (
            <div className={`flex flex-1 ${sidebarW} overflow-hidden`}>
              <ResizableSplitLayout>{children}</ResizableSplitLayout>
            </div>
          ) : (
            <main className={`flex-1 ${sidebarW} overflow-y-auto`}>{children}</main>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
