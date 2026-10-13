"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";
import { capabilityMapPath } from "@/lib/capability-map-paths";

/** /business/capabilities → /model/capabilities (domain pages under it are unaffected). */
export function CapabilityMapRedirect() {
  const router = useRouter();
  const { orgSlug, workspaceSlug } = useTenancy();
  const target = capabilityMapPath(orgSlug, workspaceSlug);
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return <p className="p-8 text-sm text-gray-400">Opening the capability map…</p>;
}
