"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { primaryViewPath } from "@/lib/tenancy";
import { isOrgAdminRole } from "@/lib/invite-form";
import { NoWorkspace } from "@/components/org/NoWorkspace";

export default function NoWorkspacePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { getToken } = useAuth();
  const { data: orgs } = useQuery({
    queryKey: ["orgs"],
    queryFn: async () => orgsApi.list((await getToken())!),
  });
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => workspacesApi.list(orgSlug, (await getToken())!),
    refetchInterval: 30_000,
  });
  const org = orgs?.find((o) => o.slug === orgSlug);
  return (
    <NoWorkspace
      orgSlug={orgSlug}
      orgName={org?.name}
      canCreate={isOrgAdminRole(org?.role)}
      workspaces={(workspaces ?? []).map((w) => ({ slug: w.slug, name: w.name, href: primaryViewPath(orgSlug, w.slug) }))}
      otherOrgs={(orgs ?? [])
        .filter((o) => o.slug !== orgSlug)
        .map((o) => ({ slug: o.slug, name: o.name, href: `/orgs/${o.slug}/no-workspace` }))}
    />
  );
}
