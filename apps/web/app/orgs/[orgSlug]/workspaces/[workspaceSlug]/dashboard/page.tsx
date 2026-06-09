"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenancy, workspaceHomePath } from "@/lib/tenancy";

/** Legacy /dashboard → workspace home. */
export default function DashboardRedirectPage() {
  const router = useRouter();
  const { orgSlug, workspaceSlug } = useTenancy();

  useEffect(() => {
    if (!orgSlug || !workspaceSlug) return;
    router.replace(workspaceHomePath(orgSlug, workspaceSlug));
  }, [router, orgSlug, workspaceSlug]);

  return <div className="p-8 text-sm text-gray-400">Opening workspace…</div>;
}
