"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { OrgMember, Workspace } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { workspacesApi } from "@/lib/api-client";
import { buildLicenceRoster, type RosterRow } from "./licences";

/**
 * Read-only licence roster: org members joined with their workspace roles, using the
 * existing GET members endpoints (same query keys as the workspace settings page).
 */
export function useLicenceRoster(
  orgSlug: string,
  members: OrgMember[] | undefined,
  workspaces: Workspace[] | undefined,
  enabled: boolean
): { rows: RosterRow[] | null; error: string | null } {
  const { getToken } = useAuth();
  const list = enabled ? (workspaces ?? []) : [];
  const results = useQueries({
    queries: list.map((ws) => ({
      queryKey: ["workspace-members", orgSlug, ws.slug],
      queryFn: async () => {
        const token = await getToken();
        return workspacesApi.listMembers(orgSlug, ws.slug, token!);
      },
      staleTime: 30_000,
    })),
  });

  const ready = enabled && !!members && !!workspaces && results.every((r) => r.isSuccess);
  const failed = results.find((r) => r.isError);
  const dataKey = results.map((r) => r.dataUpdatedAt).join(",");

  const rows = useMemo(() => {
    if (!ready || !members || !workspaces) return null;
    return buildLicenceRoster(
      members,
      workspaces.map((ws, i) => ({ slug: ws.slug, name: ws.name, members: results[i]?.data ?? [] }))
    );
    // results identity changes every render; dataKey tracks the data we read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, members, workspaces, dataKey]);

  return {
    rows,
    error: failed
      ? failed.error instanceof Error
        ? failed.error.message
        : "Could not load workspace members"
      : null,
  };
}
