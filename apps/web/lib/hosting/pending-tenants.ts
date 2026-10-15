/**
 * "+ New tenant…" typed on one card is offered on every other card at once ("Azure Tenant (new)"),
 * so ten apps in the same new tenant don't need it typed ten times. Nothing is created until the
 * batch saves, which makes one record per provider + name (and reuses an existing one of that name).
 */
import { findTenant, type CloudProvider, type HostingDetail, type TenantOption } from "@/lib/hosting/cloud";
import { normalizeTerm } from "@/lib/setup/match-tools";

/** count: how many cards are typing this name (2+ means they already share one new record). */
export type PendingTenant = { id: string; provider: CloudProvider; name: string; count?: number; originKey?: string };

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
export function collectPendingTenants(details: Array<(Partial<HostingDetail> & { key?: string }) | null | undefined>, existing: TenantOption[] = []): PendingTenant[] {
  const out = new Map<string, PendingTenant>();
  for (const d of details) {
    if (!d?.provider || d.tenantId || d.tenantShared) continue;
    const name = (d.tenantName ?? "").trim();
    if (!name || !normalizeTerm(name)) continue;
    if (findTenant(existing.filter((t) => t.provider === d.provider), name)) continue;
    const id = pendingTenantId(d.provider, name);
    const seen = out.get(id);
    if (seen) seen.count = (seen.count ?? 1) + 1;
    else out.set(id, { id, provider: d.provider, name, count: 1, ...(d.key ? { originKey: d.key } : {}) });
  }
  return [...out.values()];
}

/** Starting a card on a provider with no saved tenants: join the batch's first new tenant for it, if any. */
export function firstPendingFor(pending: PendingTenant[], provider: CloudProvider): PendingTenant | undefined {
  return pending.find((item) => item.provider === provider);
}

type CardTenant = { key: string; cloudProvider?: CloudProvider | null; tenantName?: string; tenantId?: string; tenantShared?: boolean; tenantSharedWith?: string };

/**
 * A card that picked "X (new)" follows the card that typed it: if that card renames the tenant
 * (or is still typing), the picking cards use its current name, so they all save as one record.
 */
export function resolveSharedTenants<T extends CardTenant>(rows: T[]): T[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  let changed = false;
  const out = rows.map((row) => {
    if (!row.tenantShared || row.tenantId || !row.tenantSharedWith) return row;
    const origin = byKey.get(row.tenantSharedWith);
    const name = (origin?.tenantName ?? "").trim();
    if (!origin || origin.tenantShared || origin.tenantId || origin.cloudProvider !== row.cloudProvider || !name || origin.tenantName === row.tenantName) return row;
    changed = true;
    return { ...row, tenantName: origin.tenantName };
  });
  return changed ? out : rows;
}
