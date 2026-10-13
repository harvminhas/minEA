/** One Capability map page (/model/capabilities); domain pages stay at /business/capabilities/domains/<id>, in the Model layout. */
export const NO_DOMAIN_ID = "no-domain";

export function isNoDomain(id: string): boolean {
  return id === NO_DOMAIN_ID;
}

export function capabilityMapPath(orgSlug: string, workspaceSlug: string): string {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}/model/capabilities`;
}

/** The synthetic "No domain" card has no page. */
export function domainDetailPath(orgSlug: string, workspaceSlug: string, domainId: string): string | null {
  return isNoDomain(domainId) ? null : `/orgs/${orgSlug}/workspaces/${workspaceSlug}/business/capabilities/domains/${domainId}`;
}
