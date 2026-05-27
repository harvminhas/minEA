"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/nav/TopNav";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ResizableSplitLayout } from "@/components/sidebar/ResizableSplitLayout";
import { useAppStore } from "@/lib/store";
import { orgsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const pathname = usePathname();
  const { setActiveOrg, viewMode } = useAppStore();
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

  return (
    <RequireAuth>
      <div className="h-screen overflow-hidden bg-gray-50">
        <TopNav />
        <div className="flex h-full pt-12">
          <Sidebar />
          {viewMode === "split" ? (
            /* Split mode: repo content left, draggable handle, live view panel right */
            <div className="flex flex-1 ml-[200px] overflow-hidden">
              <ResizableSplitLayout>{children}</ResizableSplitLayout>
            </div>
          ) : (
            <main className="flex-1 ml-[200px] overflow-y-auto">{children}</main>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
