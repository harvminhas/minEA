"use client";

import { useParams } from "next/navigation";
import { useTenancyOverride } from "@/lib/share-context";

export function useTenancy() {
  const override = useTenancyOverride();
  const params = useParams<{ orgSlug: string; workspaceSlug: string }>();
  const orgSlug = override?.orgSlug ?? params.orgSlug;
  const workspaceSlug = override?.workspaceSlug ?? params.workspaceSlug;
  return {
    orgSlug,
    workspaceSlug,
    basePath: `/orgs/${orgSlug}/workspaces/${workspaceSlug}`,
  };
}

export function workspacePath(orgSlug: string, workspaceSlug: string, segment = "views/products") {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${segment}`;
}

export { primaryViewPath, viewPath, workspaceHomePath } from "@/lib/views";

export function objectListPath(orgSlug: string, workspaceSlug: string, layer: string, type: string) {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${layer}/${type}`;
}
