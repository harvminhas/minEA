"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { TopNav } from "@/components/nav/TopNav";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useAppStore } from "@/lib/store";
import { orgsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { setActiveOrg } = useAppStore();
  const queryEnabled = useAuthQueryEnabled(orgSlug);

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

  return (
    <RequireAuth>
      <div className="h-screen overflow-hidden bg-gray-50">
        <TopNav />
        <div className="flex h-full pt-12">
          <Sidebar />
          <main className="flex-1 ml-[200px] overflow-y-auto">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
