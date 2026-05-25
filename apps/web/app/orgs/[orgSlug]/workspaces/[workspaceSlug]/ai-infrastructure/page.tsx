"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";
import { viewPath } from "@/lib/views";

export default function AiInfrastructureLegacyRedirect() {
  const router = useRouter();
  const { orgSlug, workspaceSlug } = useTenancy();

  useEffect(() => {
    router.replace(viewPath(orgSlug, workspaceSlug, "ai-infrastructure"));
  }, [router, orgSlug, workspaceSlug]);

  return null;
}
