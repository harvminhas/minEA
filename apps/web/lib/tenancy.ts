"use client";

import { useParams } from "next/navigation";
import { useTenancyOverride } from "@/lib/share-context";
import { useAppStore } from "@/lib/store";

export function useTenancy() {
  const override = useTenancyOverride();
  const params = useParams<{ orgSlug: string; workspaceSlug?: string }>();
  const { activeOrg, activeWorkspace } = useAppStore();
  const orgSlug = override?.orgSlug ?? params.orgSlug ?? "";
  const workspaceSlug =
    override?.workspaceSlug ??
    params.workspaceSlug ??
    (activeOrg?.slug === orgSlug ? activeWorkspace?.slug : undefined) ??
    "";
  const basePath = workspaceSlug
    ? `/orgs/${orgSlug}/workspaces/${workspaceSlug}`
    : orgSlug
      ? `/orgs/${orgSlug}`
      : "";
  return {
    orgSlug,
    workspaceSlug,
    basePath,
  };
}

/** Workspace-scoped routes — non-empty org and workspace slugs. */
export function useWorkspaceTenancy() {
  const tenancy = useTenancy();
  return tenancy;
}

export function workspacePath(orgSlug: string, workspaceSlug: string, segment = "views/products") {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${segment}`;
}

export { primaryViewPath, viewPath, workspaceHomePath } from "@/lib/views";

export function objectListPath(orgSlug: string, workspaceSlug: string, layer: string, type: string) {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/${layer}/${type}`;
}
