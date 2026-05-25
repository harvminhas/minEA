"use client";

import { useParams } from "next/navigation";
import type { Org, Workspace } from "@minea/types";

export function useTenancy() {
  const params = useParams<{ orgSlug: string; workspaceSlug: string }>();
  return {
    orgSlug: params.orgSlug,
    workspaceSlug: params.workspaceSlug,
    basePath: `/orgs/${params.orgSlug}/workspaces/${params.workspaceSlug}`,
  };
}

export function workspacePath(orgSlug: string, workspaceSlug: string, segment = "views/products") {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${segment}`;
}

export { primaryViewPath, viewPath } from "@/lib/views";

export function objectListPath(orgSlug: string, workspaceSlug: string, layer: string, type: string) {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${layer}/${type}`;
}
