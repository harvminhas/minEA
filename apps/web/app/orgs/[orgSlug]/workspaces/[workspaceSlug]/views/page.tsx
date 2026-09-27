"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ViewsGalleryPage() {
  const router = useRouter();
  const { orgSlug, workspaceSlug } = useParams<{ orgSlug: string; workspaceSlug: string }>();

  useEffect(() => {
    router.replace(`/orgs/${orgSlug}/workspaces/${workspaceSlug}/views/foundations`);
  }, [orgSlug, workspaceSlug, router]);

  return null;
}
