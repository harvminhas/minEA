"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";
import { primaryViewPath } from "@/lib/views";

/** Home = Product Portfolio (spec §6). Legacy /dashboard redirects here. */
export default function DashboardRedirectPage() {
  const router = useRouter();
  const { orgSlug, workspaceSlug } = useTenancy();

  useEffect(() => {
    router.replace(primaryViewPath(orgSlug, workspaceSlug));
  }, [router, orgSlug, workspaceSlug]);

  return (
    <div className="p-8 text-sm text-gray-400">Opening product portfolio…</div>
  );
}
