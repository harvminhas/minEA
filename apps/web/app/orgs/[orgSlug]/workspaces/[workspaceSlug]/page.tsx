"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { primaryViewPath } from "@/lib/views";

export default function WorkspaceHomePage() {
  const router = useRouter();
  const { orgSlug, workspaceSlug } = useParams<{ orgSlug: string; workspaceSlug: string }>();

  useEffect(() => {
    if (!orgSlug || !workspaceSlug) return;
    router.replace(primaryViewPath(orgSlug, workspaceSlug));
  }, [orgSlug, workspaceSlug, router]);

  return null;
}
