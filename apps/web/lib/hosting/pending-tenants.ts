/**
 * "+ New tenant…" typed on one card is offered on every other card at once ("Azure Tenant (new)"),
 * so ten apps in the same new tenant don't need it typed ten times. Nothing is created until the
 * batch saves, which makes one record per provider + name (and reuses an existing one of that name).
 */
import { findTenant, type CloudProvider, type HostingDetail, type TenantOption } from "@/lib/hosting/cloud";
import { normalizeTerm } from "@/lib/setup/match-tools";

export type PendingTenant = { id: string; provider: CloudProvider; name: string };

export const PENDING_PREFIX = "pending:";

/** One id per provider + case/space-insensitive name. Also the save's dedupe key. */
export function pendingTenantId(provider: CloudProvider, name: string): string {
  return `${PENDING_PREFIX}${provider}:${normalizeTerm(name)}`;
}

export const isPendingTenantId = (id: string | undefined | null): boolean => Boolean(id?.startsWith(PENDING_PREFIX));

/** Batch-save key for a new tenant record. */
export function tenantCreateKey(provider: CloudProvider, name: string): string {
  return `tenant:${provider}:${normalizeTerm(name)}`;
}

/**
 * New tenants typed on the cards (not ones picked from another card), one per provider + name,
 * first spelling wins. A name that matches an existing tenant isn't offered twice.
 */
export function collectPendingTenants(details: Array<Partial<HostingDetail> | null | undefined>, existing: TenantOption[] = []): PendingTenant[] {
  const out = new Map<string, PendingTenant>();
  for (const d of details) {
    if (!d?.provider || d.tenantId || d.tenantShared) continue;
    const name = (d.tenantName ?? "").trim();
    if (!name || !normalizeTerm(name)) continue;
    if (findTenant(existing.filter((t) => t.provider === d.provider), name)) continue;
    const id = pendingTenantId(d.provider, name);
    if (!out.has(id)) out.set(id, { id, provider: d.provider, name });
  }
  return [...out.values()];
}
