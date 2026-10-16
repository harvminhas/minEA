import type { SupportRequestBody } from "@/lib/support";
import type {
  MinEAObject,
  ObjectCreate,
  ObjectUpdate,
  ObjectHistoryResponse,
  ObjectTechDebtSummary,
  ObjectListResponse,
  SystemProductLinksResponse,
  Relationship,
  RelationshipCreate,
  Workspace,
  WorkspaceCopyPreview,
  WorkspaceCreate,
  WorkspaceSnapshot,
  WorkspaceSummary,
  AiInsight,
  AiInsightsResponse,
  CisPayload,
  Org,
  OrgCreate,
  OrgMember,
  BillingStatus,
  SoloCheckoutResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalResponse,
  WorkspaceMember,
  InvitePreview,
  Invite,
  InviteCreated,
  Product,
  ProductCreate,
  ProductUpdate,
  ProductGraphResponse,
  ProductHistoryResponse,
  ProductListResponse,
  Process,
  ProcessCreate,
  ProcessListResponse,
  Journey,
  JourneyCreate,
  JourneyListResponse,
  DerivedSystemsResponse,
  CapabilityHeatmap,
  CapabilityMap,
  CapabilityMapStatus,
  CapabilityTemplateDetail,
  CapabilityTemplateSummary,
  AdoptTemplateResponse,
  LibraryDomainGroup,
  CapabilityPickerSuggestions,
  AddDomainMappingSystemRequest,
  CreateDomainMappingSystemRequest,
  DomainDetail,
  DomainProductsResponse,
  DomainHistoryResponse,
  UpsertDomainMappingRequest,
  PeopleRole,
  PeopleRoleCreate,
  PeopleRoleUpdate,
  PeopleRoleDetail,
  PeopleRoleListResponse,
  Team,
  TeamCreate,
  TeamUpdate,
  TeamDetail,
  TeamListResponse,
  PeopleContact,
  PeopleContactCreate,
  PeopleContactDetail,
  PeopleContactUpdate,
  PeopleContactListResponse,
  TeamRoleAssignmentCreate,
  TeamRoleAssignmentUpdate,
  AddRoleToTeamCreate,
  AccountabilityCreate,
  AccountabilityUpdate,
  DataObjectDetail,
  DataObjectCreate,
  DataObjectUpdate,
  DataStoreDetail,
  DataStoreCreate,
  DataStoreUpdate,
  DataDomainDetail,
  DataDomainCreate,
  DataDomainUpdate,
  DataLinkCreate,
  FlowEndpointCatalog,
  ShareCreate,
  ShareCreated,
  ShareLink,
  SharePreview,
} from "@minea/types";
import { apiV1Url } from "@/lib/api-base";
import { apiRequestGate, shouldRetryRequest } from "@/lib/request-gate";
import { getShareApiPath } from "@/lib/share-context";
import { askWithStream, type StreamHandlers } from "@/lib/ask/stream";
import type { AskContextTurn } from "@/lib/ask/thread";

function wsBase(orgSlug: string, workspaceSlug: string) {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}`;
}

type ApiInit = RequestInit & { token?: string; returnStatus?: boolean };

async function apiFetch<T>(path: string, init?: ApiInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" || method === "HEAD" ? 3 : 1;
  return apiRequestGate.run(async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await apiFetchOnce<T>(path, init);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const status = Number(lastError.message.slice(0, 3));
        if (!shouldRetryRequest(method, status, attempt, maxAttempts)) throw lastError;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError ?? new Error("API error");
  });
}

async function apiFetchOnce<T>(path: string, init?: ApiInit): Promise<T> {
  const { token, returnStatus, ...fetchInit } = init ?? {};
  const sharePath = getShareApiPath(path);
  const resolvedPath = sharePath ?? path;
  const res = await fetch(apiV1Url(resolvedPath), {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...(!sharePath && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchInit.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail =
      typeof err.detail === "string"
        ? err.detail
        : JSON.stringify(err.detail) ?? "API error";
    throw new Error(`${res.status} ${detail} (${resolvedPath})`);
  }
  if (res.status === 204) {
    return (returnStatus ? { body: undefined, status: res.status } : undefined) as T;
  }
  const body = await res.json();
  if (returnStatus) return { body, status: res.status } as T;
  return body;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface VerificationEmailResult {
  message: string;
  email_sent: boolean;
  verification_link?: string | null;
}

export interface AuthMeResult {
  email: string;
  email_verified: boolean;
  requires_email_verification: boolean;
  providers: string[];
  email_verified_at?: string | null;
}

export interface ConfirmEmailVerificationResult {
  message: string;
  verified: boolean;
}

export const authApi = {
  me: (token: string) => apiFetch<AuthMeResult>("/auth/me", { token }),

  sendVerificationEmail: (token: string, appOrigin?: string) =>
    apiFetch<VerificationEmailResult>("/auth/send-verification-email", {
      method: "POST",
      token,
      body: JSON.stringify(appOrigin ? { app_origin: appOrigin } : {}),
    }),

  confirmEmailVerification: (token: string) =>
    apiFetch<ConfirmEmailVerificationResult>("/auth/confirm-email-verification", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  /** @deprecated Use sendVerificationEmail */
  getDevVerificationLink: (token: string) =>
    apiFetch<VerificationEmailResult>("/auth/dev-verification-link", {
      method: "POST",
      token,
    }),
};

// ─── Orgs ────────────────────────────────────────────────────────────────────

export const billingApi = {
  status: (orgSlug: string, token: string) =>
    apiFetch<BillingStatus>(`/orgs/${orgSlug}/billing/status`, { token }),
  startSoloCheckout: (orgSlug: string, token: string) =>
    apiFetch<SoloCheckoutResponse>(`/orgs/${orgSlug}/billing/solo/checkout`, {
      method: "POST",
      token,
    }),
  /** Stripe Checkout for a pack. Returns the hosted Checkout URL to redirect to. */
  startCheckout: (orgSlug: string, body: CheckoutRequest, token: string) =>
    apiFetch<CheckoutResponse>(`/orgs/${orgSlug}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
  /** Tell the API a paid checkout still isn't on the org (it alerts the owner after 5 min). */
  reportCheckoutPending: (orgSlug: string, sessionId: string, token: string) =>
    apiFetch<{ status: "active" | "waiting" | "alerted" }>(`/orgs/${orgSlug}/billing/checkout-pending`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
      token,
    }),
  /** Stripe Customer Portal session (payment method, invoices, plan switch, cancel). */
  openPortal: (orgSlug: string, token: string) =>
    apiFetch<PortalResponse>(`/orgs/${orgSlug}/billing/portal`, {
      method: "POST",
      token,
    }),
};

export const supportApi = {
  /** In-app Help form. The API takes the org slug and email from the session. */
  submit: (orgSlug: string, body: SupportRequestBody, token: string) =>
    apiFetch<{ id: string; created_at: string }>(`/orgs/${orgSlug}/support`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};

export const orgsApi = {
  list: (token: string) => apiFetch<Org[]>("/orgs", { token }),
  get: (orgSlug: string, token: string) => apiFetch<Org>(`/orgs/${orgSlug}`, { token }),
  create: (body: OrgCreate, token: string) =>
    apiFetch<Org>("/orgs", { method: "POST", body: JSON.stringify(body), token }),
  listMembers: (orgSlug: string, token: string) =>
    apiFetch<OrgMember[]>(`/orgs/${orgSlug}/members`, { token }),
  listInvites: (orgSlug: string, token: string) =>
    apiFetch<Invite[]>(`/orgs/${orgSlug}/invites`, { token }),
  createInvite: (orgSlug: string, body: { email: string; role: string; workspace_slug?: string }, token: string) =>
    apiFetch<InviteCreated>(`/orgs/${orgSlug}/invites`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
  revokeInvite: (orgSlug: string, inviteId: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/invites/${inviteId}`, { method: "DELETE", token }),
  resendInvite: (orgSlug: string, inviteId: string, token: string) =>
    apiFetch<InviteCreated>(`/orgs/${orgSlug}/invites/${inviteId}/resend`, { method: "POST", token }),
  changeMemberRole: (orgSlug: string, userId: string, role: string, token: string) =>
    apiFetch<OrgMember>(`/orgs/${orgSlug}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
      token,
    }),
  removeMember: (orgSlug: string, userId: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/members/${userId}`, { method: "DELETE", token }),
  leaveOrg: (orgSlug: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/leave`, { method: "POST", token }),
  deleteOrg: (orgSlug: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}`, { method: "DELETE", token }),
};

export const invitesApi = {
  preview: (token: string) => apiFetch<InvitePreview>(`/invites/${token}`),
  accept: (token: string, authToken: string) =>
    apiFetch<{ org_slug: string; role: string; workspace_slug?: string }>(`/invites/${token}/accept`, {
      method: "POST",
      token: authToken,
    }),
};

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const catalogApi = {
  get: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<{
      version: number;
      builtAt: string | null;
      dirty: boolean;
      objects: MinEAObject[];
      relationships: Relationship[];
    }>(`${wsBase(orgSlug, workspaceSlug)}/catalog`, { token }),
  refresh: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<{
      version: number;
      builtAt: string | null;
      dirty: boolean;
      objects: MinEAObject[];
      relationships: Relationship[];
    }>(`${wsBase(orgSlug, workspaceSlug)}/catalog/refresh`, { method: "POST", token }),
};

export type SetupProgress = {
  setupDismissedAt: string | null;
  setupStep: number | null;
  mapReadyShownAt: string | null;
};

export const setupApi = {
  get: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<SetupProgress>(`${wsBase(orgSlug, workspaceSlug)}/setup`, { token }),
  save: (
    orgSlug: string,
    workspaceSlug: string,
    body: { setupDismissedAt?: string | null; setupStep?: number | null; clearDismissed?: boolean; mapReadyShownAt?: string | null },
    token: string,
  ) =>
    apiFetch<SetupProgress>(`${wsBase(orgSlug, workspaceSlug)}/setup`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
};

export type WorkspaceSettings = { architectureAdvanced?: boolean | null; stored: boolean };

export const workspaceSettingsApi = {
  get: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<WorkspaceSettings>(`${wsBase(orgSlug, workspaceSlug)}/settings`, { token }),
  save: (orgSlug: string, workspaceSlug: string, body: { architectureAdvanced?: boolean | null }, token: string) =>
    apiFetch<WorkspaceSettings>(`${wsBase(orgSlug, workspaceSlug)}/settings`, { method: "PATCH", token, body: JSON.stringify(body) }),
};

export type CatalogEntry = import("@/lib/setup/match-tools").ToolRecord & { id: string };
export type CatalogMiss = { key: string; name: string; count: number; lastSeen: string; suggestion: { name?: string; vendor?: string; category?: string; hosting?: string; kind?: string; confidence?: number } | null };

export type AdminUserOrg = { slug: string; name: string; plan: string; role: string; members: number; objects: number; subscription: boolean };
export type AdminUser = { id: string; email: string; name: string; created_at: string | null; verified: boolean; last_active: string | null; objects_created: number; orgs: AdminUserOrg[]; accounts_with_email?: number; firebase_uid_hint?: string };
export type EraseAccount = { id: string; email: string; name: string; created_at: string | null; firebase_uid_hint: string; orgs: { slug: string; name: string; role: string | null }[] };
export type ErasePreviewOrg = { id: string; slug: string; name: string; plan: string; role: string | null; members: number; other_admins: number; subscription: boolean; action: "delete" | "leave" | "blocked"; reason: string; workspaces: number; objects: number; relationships: number };
export type ErasePreview = { user: { id: string; email: string; name: string; created_at: string | null }; orgs: ErasePreviewOrg[]; blockers: string[]; needs_subscription_ack: boolean; counts: Record<string, number>; is_self: boolean; is_platform_admin: boolean; accounts?: EraseAccount[]; all_accounts?: boolean; accounts_with_email?: number };

export const platformAdminApi = {
  users: (q: string, sort: "newest" | "oldest", token: string) =>
    apiFetch<{ users: AdminUser[] }>(`/platform/admin/users?q=${encodeURIComponent(q)}&sort=${sort}`, { token }),
  erasePreview: (userId: string, token: string, allAccounts = true) =>
    apiFetch<ErasePreview>(`/platform/admin/users/${userId}/erase-preview?all_accounts=${allAccounts}`, { token }),
  erase: (userId: string, body: { confirm_email: string; acknowledge_subscriptions: boolean; all_accounts?: boolean }, token: string) =>
    apiFetch<{ erased: string; counts: Record<string, number> }>(`/platform/admin/users/${userId}/erase`, { method: "POST", token, body: JSON.stringify(body) }),
};

export const toolCatalogApi = {
  tools: (token: string) => apiFetch<{ version: string; source: string; tools: unknown }>(`/catalog/tools`, { token }),
  me: (token: string) => apiFetch<{ platformAdmin: boolean }>(`/platform/me`, { token }),
  list: (q: string, token: string) => apiFetch<{ total: number; entries: CatalogEntry[] }>(`/platform/catalog/entries?q=${encodeURIComponent(q)}`, { token }),
  create: (body: Partial<CatalogEntry>, token: string) => apiFetch<CatalogEntry>(`/platform/catalog/entries`, { method: "POST", token, body: JSON.stringify(body) }),
  update: (id: string, body: Partial<CatalogEntry>, token: string) => apiFetch<CatalogEntry>(`/platform/catalog/entries/${id}`, { method: "PUT", token, body: JSON.stringify(body) }),
  remove: (id: string, token: string) => apiFetch<void>(`/platform/catalog/entries/${id}`, { method: "DELETE", token }),
  misses: (token: string) => apiFetch<{ misses: CatalogMiss[] }>(`/platform/catalog/misses`, { token }),
  dismissMiss: (key: string, token: string) => apiFetch<void>(`/platform/catalog/misses/${encodeURIComponent(key)}`, { method: "DELETE", token }),
};

export const catalogLookupApi = {
  lookup: (orgSlug: string, names: string[], token: string, signal?: AbortSignal) =>
    apiFetch<{ results: import("@/lib/setup/ai-lookup").LookupResult[] }>(`/orgs/${orgSlug}/catalog/lookup`, { method: "POST", token, body: JSON.stringify({ names }), signal }),
};

export const addApi = {
  save: (
    orgSlug: string,
    workspaceSlug: string,
    body: {
      creates: { key: string; type: string; name: string; properties: Record<string, unknown>; owner?: string; owner_team_name?: string; point_of_contact_name?: string }[];
      updates: { id: string; properties?: Record<string, unknown>; overwrite?: boolean; owner?: string; owner_team_name?: string; point_of_contact_name?: string }[];
      relationships: { type: string; from_key?: string; to_key?: string; from_id?: string; to_id?: string; from_type: string; to_type: string; attributes?: Record<string, unknown> }[];
    },
    token: string,
  ) =>
    apiFetch<{
      objects: MinEAObject[];
      relationships: Relationship[];
      created_object_ids: string[];
      created_relationship_ids: string[];
    }>(`${wsBase(orgSlug, workspaceSlug)}/objects/batch`, { method: "POST", token, body: JSON.stringify(body) }),
  undo: (
    orgSlug: string,
    workspaceSlug: string,
    body: { object_ids: string[]; relationship_ids: string[] },
    token: string,
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/objects/batch/undo`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
};

export type DirectoryKind = "team" | "person" | "role";
export type DirectoryRow = { id: string; name: string; usage: number; description?: string | null; lead_name?: string | null; lead_email?: string | null; email?: string | null; phone?: string | null; title?: string | null; notes?: string | null; team_id?: string | null; team_name?: string | null; role_kind?: string | null };
export type PeopleDirectory = { teams: DirectoryRow[]; people: DirectoryRow[]; roles: DirectoryRow[]; contactExtras: boolean; duplicates: Record<DirectoryKind, string[][]> };

export const peopleDirectoryApi = {
  get: (orgSlug: string, workspace: string, token: string) =>
    apiFetch<PeopleDirectory>(`/orgs/${orgSlug}/people-directory?workspace=${encodeURIComponent(workspace)}`, { token }),
  add: (orgSlug: string, workspace: string, kind: DirectoryKind, body: Record<string, unknown>, token: string) =>
    apiFetch<{ id: string; created: boolean }>(`/orgs/${orgSlug}/people-directory/${kind}?workspace=${encodeURIComponent(workspace)}`, { method: "POST", token, body: JSON.stringify(body) }),
  edit: (orgSlug: string, workspace: string, kind: DirectoryKind, id: string, body: Record<string, unknown>, token: string) =>
    apiFetch<{ ok: boolean }>(`/orgs/${orgSlug}/people-directory/${kind}/${id}?workspace=${encodeURIComponent(workspace)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  merge: (orgSlug: string, workspace: string, kind: DirectoryKind, intoId: string, fromIds: string[], token: string) =>
    apiFetch<{ merged: number }>(`/orgs/${orgSlug}/people-directory/${kind}/merge?workspace=${encodeURIComponent(workspace)}`, { method: "POST", token, body: JSON.stringify({ into_id: intoId, from_ids: fromIds }) }),
  remove: (orgSlug: string, workspace: string, kind: DirectoryKind, id: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/people-directory/${kind}/${id}?workspace=${encodeURIComponent(workspace)}`, { method: "DELETE", token }),
};

export type CloudRegionRow = { id: string; key: string; provider: string; name: string; usage: number };
export type CloudTenantRow = { id: string; name: string; owner: string; provider: string; platform_kind: string; tenant_id: string; annual_cost: string; regions_used: string[]; usage: number };
export type CloudsDirectory = { tenants: CloudTenantRow[]; custom: CloudRegionRow[]; available: boolean; duplicates: string[][] };

/** Custom regions for the pickers (built-in providers and regions ship in lib/hosting/cloud-regions.json). */
export const cloudRegionsApi = {
  list: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<{ custom: CloudRegionRow[]; available: boolean }>(`/orgs/${orgSlug}/workspaces/${workspaceSlug}/cloud-regions`, { token }),
  add: (orgSlug: string, workspaceSlug: string, provider: string, name: string, token: string) =>
    apiFetch<{ key: string; name: string; created: boolean }>(`/orgs/${orgSlug}/workspaces/${workspaceSlug}/cloud-regions`, { method: "POST", token, body: JSON.stringify({ provider, name }) }),
};

/** Org settings > Clouds & tenants (org admins), one workspace at a time like People & teams. */
export const cloudsApi = {
  get: (orgSlug: string, workspace: string, token: string) =>
    apiFetch<CloudsDirectory>(`/orgs/${orgSlug}/clouds?workspace=${encodeURIComponent(workspace)}`, { token }),
  editTenant: (orgSlug: string, workspace: string, id: string, body: Record<string, unknown>, token: string) =>
    apiFetch<{ ok: boolean }>(`/orgs/${orgSlug}/clouds/tenants/${id}?workspace=${encodeURIComponent(workspace)}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  mergeTenants: (orgSlug: string, workspace: string, intoId: string, fromIds: string[], token: string) =>
    apiFetch<{ merged: number }>(`/orgs/${orgSlug}/clouds/tenants/merge?workspace=${encodeURIComponent(workspace)}`, { method: "POST", token, body: JSON.stringify({ into_id: intoId, from_ids: fromIds }) }),
  deleteTenant: (orgSlug: string, workspace: string, id: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/clouds/tenants/${id}?workspace=${encodeURIComponent(workspace)}`, { method: "DELETE", token }),
  renameRegion: (orgSlug: string, workspace: string, id: string, name: string, token: string) =>
    apiFetch<{ ok: boolean }>(`/orgs/${orgSlug}/clouds/regions/${id}?workspace=${encodeURIComponent(workspace)}`, { method: "PATCH", token, body: JSON.stringify({ name }) }),
  mergeRegions: (orgSlug: string, workspace: string, intoKey: string, fromIds: string[], token: string) =>
    apiFetch<{ merged: number }>(`/orgs/${orgSlug}/clouds/regions/merge?workspace=${encodeURIComponent(workspace)}`, { method: "POST", token, body: JSON.stringify({ into_key: intoKey, from_ids: fromIds }) }),
  deleteRegion: (orgSlug: string, workspace: string, id: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/clouds/regions/${id}?workspace=${encodeURIComponent(workspace)}`, { method: "DELETE", token }),
};

export const workspacesApi = {
  list: (orgSlug: string, token: string) =>
    apiFetch<Workspace[]>(`/orgs/${orgSlug}/workspaces`, { token }),
  get: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<Workspace>(`/orgs/${orgSlug}/workspaces/${workspaceSlug}`, { token }),
  getSummary: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<WorkspaceSnapshot>(
      `/orgs/${orgSlug}/workspaces/${workspaceSlug}/summary`,
      { token }
    ),
  create: (orgSlug: string, body: WorkspaceCreate, token: string) =>
    apiFetch<Workspace>(`/orgs/${orgSlug}/workspaces`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
  copyPreview: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<WorkspaceCopyPreview>(
      `/orgs/${orgSlug}/workspaces/${workspaceSlug}/copy-preview`,
      { token }
    ),
  context: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<object>(`${wsBase(orgSlug, workspaceSlug)}/context`, { token }),
  update: (orgSlug: string, workspaceSlug: string, body: { name?: string }, token: string) =>
    apiFetch<Workspace>(`/orgs/${orgSlug}/workspaces/${workspaceSlug}`, { method: "PUT", body: JSON.stringify(body), token }),
  delete: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<void>(`/orgs/${orgSlug}/workspaces/${workspaceSlug}`, { method: "DELETE", token }),
  listMembers: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<WorkspaceMember[]>(`${wsBase(orgSlug, workspaceSlug)}/members`, { token }),
  listInvites: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<Invite[]>(`${wsBase(orgSlug, workspaceSlug)}/invites`, { token }),
  resendInvite: (orgSlug: string, workspaceSlug: string, inviteId: string, token: string) =>
    apiFetch<InviteCreated>(`${wsBase(orgSlug, workspaceSlug)}/invites/${inviteId}/resend`, { method: "POST", token }),
  changeMemberRole: (orgSlug: string, workspaceSlug: string, userId: string, role: string, token: string) =>
    apiFetch<WorkspaceMember>(`${wsBase(orgSlug, workspaceSlug)}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
      token,
    }),
  removeMember: (orgSlug: string, workspaceSlug: string, userId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/members/${userId}`, { method: "DELETE", token }),
  leave: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/leave`, { method: "POST", token }),
  createInvite: (
    orgSlug: string,
    workspaceSlug: string,
    body: { email: string; role: string },
    token: string
  ) =>
    apiFetch<InviteCreated>(`${wsBase(orgSlug, workspaceSlug)}/invites`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
  revokeInvite: (orgSlug: string, workspaceSlug: string, inviteId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/invites/${inviteId}`, {
      method: "DELETE",
      token,
    }),
  listShares: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<ShareLink[]>(`${wsBase(orgSlug, workspaceSlug)}/shares`, { token }),
  createShare: (orgSlug: string, workspaceSlug: string, body: ShareCreate, token: string) =>
    apiFetch<ShareCreated>(`${wsBase(orgSlug, workspaceSlug)}/shares`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
  revokeShare: (orgSlug: string, workspaceSlug: string, shareId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/shares/${shareId}`, {
      method: "DELETE",
      token,
    }),
};

export const sharesApi = {
  preview: (token: string) => apiFetch<SharePreview>(`/shares/${token}`),
};

// ─── Objects ─────────────────────────────────────────────────────────────────

export const objectsApi = {
  list: (
    orgSlug: string,
    workspaceSlug: string,
    params: { type?: string; status?: string; search?: string; page?: number; page_size?: number },
    token: string
  ) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set("type", params.type);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    const query = qs.toString();
    return apiFetch<ObjectListResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/objects${query ? `?${query}` : ""}`,
      { token }
    );
  },

  get: (orgSlug: string, workspaceSlug: string, id: string, token: string) =>
    apiFetch<MinEAObject>(`${wsBase(orgSlug, workspaceSlug)}/objects/${id}`, { token }),

  create: (orgSlug: string, workspaceSlug: string, body: ObjectCreate, token: string) =>
    apiFetch<MinEAObject>(`${wsBase(orgSlug, workspaceSlug)}/objects`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (orgSlug: string, workspaceSlug: string, id: string, body: ObjectUpdate, token: string) =>
    apiFetch<MinEAObject>(`${wsBase(orgSlug, workspaceSlug)}/objects/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  switchType: (
    orgSlug: string,
    workspaceSlug: string,
    id: string,
    body: { type: string; drop_relationship_ids: string[] },
    token: string
  ) =>
    apiFetch<{ object: MinEAObject; relationships: Relationship[]; removed_relationship_ids: string[] }>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${id}/switch-type`,
      { method: "POST", body: JSON.stringify(body), token }
    ),

  delete: (orgSlug: string, workspaceSlug: string, id: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/objects/${id}`, { method: "DELETE", token }),

  history: (orgSlug: string, workspaceSlug: string, objectId: string, token: string) =>
    apiFetch<ObjectHistoryResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${objectId}/history`,
      { token }
    ),

  techDebtSummary: (orgSlug: string, workspaceSlug: string, objectId: string, token: string) =>
    apiFetch<ObjectTechDebtSummary>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${objectId}/tech-debt`,
      { token }
    ),

  productLinks: (orgSlug: string, workspaceSlug: string, objectId: string, token: string) =>
    apiFetch<SystemProductLinksResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${objectId}/products`,
      { token }
    ),

  linkProduct: (
    orgSlug: string,
    workspaceSlug: string,
    objectId: string,
    productId: string,
    token: string
  ) =>
    apiFetch<SystemProductLinksResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${objectId}/products`,
      {
        method: "POST",
        body: JSON.stringify({ product_id: productId }),
        token,
      }
    ),

  unlinkProduct: (
    orgSlug: string,
    workspaceSlug: string,
    objectId: string,
    productId: string,
    token: string
  ) =>
    apiFetch<SystemProductLinksResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${objectId}/products/${productId}`,
      { method: "DELETE", token }
    ),
};

// ─── Relationships ────────────────────────────────────────────────────────────

export const relationshipsApi = {
  list: (
    orgSlug: string,
    workspaceSlug: string,
    params: { from_object_id?: string; to_object_id?: string; type?: string },
    token: string
  ) => {
    const qs = new URLSearchParams();
    if (params.from_object_id) qs.set("from_object_id", params.from_object_id);
    if (params.to_object_id) qs.set("to_object_id", params.to_object_id);
    if (params.type) qs.set("type", params.type);
    const query = qs.toString();
    return apiFetch<Relationship[]>(
      `${wsBase(orgSlug, workspaceSlug)}/relationships${query ? `?${query}` : ""}`,
      { token }
    );
  },

  create: (orgSlug: string, workspaceSlug: string, body: RelationshipCreate, token: string) =>
    apiFetch<Relationship>(`${wsBase(orgSlug, workspaceSlug)}/relationships`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  createWithStatus: (orgSlug: string, workspaceSlug: string, body: RelationshipCreate, token: string) =>
    apiFetch<{ body: Relationship; status: number }>(`${wsBase(orgSlug, workspaceSlug)}/relationships`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
      returnStatus: true,
    }),

  /** Merge into a link's attributes (None clears a key), e.g. the region on app → tenant. */
  updateAttributes: (orgSlug: string, workspaceSlug: string, id: string, attributes: Record<string, unknown>, token: string) =>
    apiFetch<Relationship>(`${wsBase(orgSlug, workspaceSlug)}/relationships/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ attributes }),
      token,
    }),

  delete: (orgSlug: string, workspaceSlug: string, id: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/relationships/${id}`, {
      method: "DELETE",
      token,
    }),
};

// ─── Products (Product Portfolio view) ───────────────────────────────────────

export const productsApi = {
  list: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<ProductListResponse>(`${wsBase(orgSlug, workspaceSlug)}/products`, { token }),

  get: (orgSlug: string, workspaceSlug: string, productId: string, token: string) =>
    apiFetch<Product>(`${wsBase(orgSlug, workspaceSlug)}/products/${productId}`, { token }),

  create: (orgSlug: string, workspaceSlug: string, body: ProductCreate, token: string) =>
    apiFetch<Product>(`${wsBase(orgSlug, workspaceSlug)}/products`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (
    orgSlug: string,
    workspaceSlug: string,
    productId: string,
    body: ProductUpdate,
    token: string
  ) =>
    apiFetch<Product>(`${wsBase(orgSlug, workspaceSlug)}/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  graph: (orgSlug: string, workspaceSlug: string, productId: string, token: string) =>
    apiFetch<ProductGraphResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/products/${productId}/graph`,
      { token }
    ),

  history: (orgSlug: string, workspaceSlug: string, productId: string, token: string) =>
    apiFetch<ProductHistoryResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/products/${productId}/history`,
      { token }
    ),

  delete: (orgSlug: string, workspaceSlug: string, productId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/products/${productId}`, {
      method: "DELETE",
      token,
    }),
};

// ─── Processes ───────────────────────────────────────────────────────────────

export const processesApi = {
  list: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<ProcessListResponse>(`${wsBase(orgSlug, workspaceSlug)}/processes`, { token }),

  get: (orgSlug: string, workspaceSlug: string, processId: string, token: string) =>
    apiFetch<Process>(`${wsBase(orgSlug, workspaceSlug)}/processes/${processId}`, { token }),

  create: (orgSlug: string, workspaceSlug: string, body: ProcessCreate, token: string) =>
    apiFetch<Process>(`${wsBase(orgSlug, workspaceSlug)}/processes`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (
    orgSlug: string,
    workspaceSlug: string,
    processId: string,
    body: Partial<ProcessCreate>,
    token: string
  ) =>
    apiFetch<Process>(`${wsBase(orgSlug, workspaceSlug)}/processes/${processId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),
};

// ─── Journeys ────────────────────────────────────────────────────────────────

export const journeysApi = {
  list: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<JourneyListResponse>(`${wsBase(orgSlug, workspaceSlug)}/journeys`, { token }),

  get: (orgSlug: string, workspaceSlug: string, journeyId: string, token: string) =>
    apiFetch<Journey>(`${wsBase(orgSlug, workspaceSlug)}/journeys/${journeyId}`, { token }),

  create: (orgSlug: string, workspaceSlug: string, body: JourneyCreate, token: string) =>
    apiFetch<Journey>(`${wsBase(orgSlug, workspaceSlug)}/journeys`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (
    orgSlug: string,
    workspaceSlug: string,
    journeyId: string,
    body: Partial<JourneyCreate>,
    token: string
  ) =>
    apiFetch<Journey>(`${wsBase(orgSlug, workspaceSlug)}/journeys/${journeyId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  deriveSystems: (
    orgSlug: string,
    workspaceSlug: string,
    processIds: string[],
    token: string
  ) => {
    const params = new URLSearchParams();
    for (const id of processIds) params.append("process_ids", id);
    const qs = params.toString();
    return apiFetch<DerivedSystemsResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/journeys/derive-systems${qs ? `?${qs}` : ""}`,
      { token }
    );
  },
};

// ─── Capability Map ────────────────────────────────────────────────────────────

export const capabilityMapApi = {
  getStatus: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<CapabilityMapStatus>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/status`, { token }),

  get: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<CapabilityMap>(`${wsBase(orgSlug, workspaceSlug)}/capability-map`, { token }),

  heatmap: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<CapabilityHeatmap>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/heatmap`, { token }),

  listTemplates: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<CapabilityTemplateSummary[]>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/templates`, {
      token,
    }),

  getTemplate: (orgSlug: string, workspaceSlug: string, templateId: string, token: string) =>
    apiFetch<CapabilityTemplateDetail>(
      `${wsBase(orgSlug, workspaceSlug)}/capability-map/templates/${templateId}`,
      { token }
    ),

  libraryDomains: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<LibraryDomainGroup[]>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/library/domains`, {
      token,
    }),

  libraryCapabilities: (orgSlug: string, workspaceSlug: string, domainId: string, token: string) =>
    apiFetch<CapabilityPickerSuggestions>(
      `${wsBase(orgSlug, workspaceSlug)}/capability-map/library/capabilities?domain_id=${domainId}`,
      { token }
    ),

  adoptTemplate: (orgSlug: string, workspaceSlug: string, templateId: string, token: string) =>
    apiFetch<AdoptTemplateResponse>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/adopt`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
      token,
    }),

  getDomain: (orgSlug: string, workspaceSlug: string, domainId: string, token: string) =>
    apiFetch<DomainDetail>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/domains/${domainId}`, {
      token,
    }),

  getDomainProducts: (orgSlug: string, workspaceSlug: string, domainId: string, token: string) =>
    apiFetch<DomainProductsResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/capability-map/domains/${domainId}/products`,
      { token }
    ),

  getDomainHistory: (orgSlug: string, workspaceSlug: string, domainId: string, token: string) =>
    apiFetch<DomainHistoryResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/capability-map/domains/${domainId}/history`,
      { token }
    ),

  addMappingSystem: (
    orgSlug: string,
    workspaceSlug: string,
    domainId: string,
    body: AddDomainMappingSystemRequest,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/domains/${domainId}/mapping-systems`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  createMappingSystem: (
    orgSlug: string,
    workspaceSlug: string,
    domainId: string,
    body: CreateDomainMappingSystemRequest,
    token: string
  ) =>
    apiFetch<DomainDetail>(
      `${wsBase(orgSlug, workspaceSlug)}/capability-map/domains/${domainId}/mapping-systems/create`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token,
      }
    ),

  upsertMapping: (
    orgSlug: string,
    workspaceSlug: string,
    domainId: string,
    body: UpsertDomainMappingRequest,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/capability-map/domains/${domainId}/mappings`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),
};

// ─── People (Roles & Teams) ──────────────────────────────────────────────────

export const peopleApi = {
  listRoles: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<PeopleRoleListResponse>(`${wsBase(orgSlug, workspaceSlug)}/people/roles`, { token }),

  getRole: (orgSlug: string, workspaceSlug: string, roleId: string, token: string) =>
    apiFetch<PeopleRoleDetail>(`${wsBase(orgSlug, workspaceSlug)}/people/roles/${roleId}`, { token }),

  createRole: (orgSlug: string, workspaceSlug: string, body: PeopleRoleCreate, token: string) =>
    apiFetch<PeopleRole>(`${wsBase(orgSlug, workspaceSlug)}/people/roles`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateRole: (
    orgSlug: string,
    workspaceSlug: string,
    roleId: string,
    body: PeopleRoleUpdate,
    token: string
  ) =>
    apiFetch<PeopleRole>(`${wsBase(orgSlug, workspaceSlug)}/people/roles/${roleId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteRole: (orgSlug: string, workspaceSlug: string, roleId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/roles/${roleId}`, {
      method: "DELETE",
      token,
    }),

  linkRoleToTeam: (
    orgSlug: string,
    workspaceSlug: string,
    roleId: string,
    body: AddRoleToTeamCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/roles/${roleId}/teams`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  addRoleAccountability: (
    orgSlug: string,
    workspaceSlug: string,
    roleId: string,
    body: AccountabilityCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/roles/${roleId}/accountabilities`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  listTeams: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<TeamListResponse>(`${wsBase(orgSlug, workspaceSlug)}/people/teams`, { token }),

  listContacts: (
    orgSlug: string,
    workspaceSlug: string,
    token: string,
    teamId?: string
  ) => {
    const params = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
    return apiFetch<PeopleContactListResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/people/contacts${params}`,
      { token }
    );
  },

  getContact: (orgSlug: string, workspaceSlug: string, contactId: string, token: string) =>
    apiFetch<PeopleContactDetail>(`${wsBase(orgSlug, workspaceSlug)}/people/contacts/${contactId}`, {
      token,
    }),

  createContact: (
    orgSlug: string,
    workspaceSlug: string,
    body: PeopleContactCreate,
    token: string
  ) =>
    apiFetch<PeopleContact>(`${wsBase(orgSlug, workspaceSlug)}/people/contacts`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateContact: (
    orgSlug: string,
    workspaceSlug: string,
    contactId: string,
    body: PeopleContactUpdate,
    token: string
  ) =>
    apiFetch<PeopleContact>(`${wsBase(orgSlug, workspaceSlug)}/people/contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteContact: (orgSlug: string, workspaceSlug: string, contactId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/contacts/${contactId}`, {
      method: "DELETE",
      token,
    }),

  getTeam: (orgSlug: string, workspaceSlug: string, teamId: string, token: string) =>
    apiFetch<TeamDetail>(`${wsBase(orgSlug, workspaceSlug)}/people/teams/${teamId}`, { token }),

  createTeam: (orgSlug: string, workspaceSlug: string, body: TeamCreate, token: string) =>
    apiFetch<Team>(`${wsBase(orgSlug, workspaceSlug)}/people/teams`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateTeam: (
    orgSlug: string,
    workspaceSlug: string,
    teamId: string,
    body: TeamUpdate,
    token: string
  ) =>
    apiFetch<Team>(`${wsBase(orgSlug, workspaceSlug)}/people/teams/${teamId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  deleteTeam: (orgSlug: string, workspaceSlug: string, teamId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/teams/${teamId}`, {
      method: "DELETE",
      token,
    }),

  addTeamRole: (
    orgSlug: string,
    workspaceSlug: string,
    teamId: string,
    body: TeamRoleAssignmentCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/teams/${teamId}/roles`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateTeamRole: (
    orgSlug: string,
    workspaceSlug: string,
    teamId: string,
    assignmentId: string,
    body: TeamRoleAssignmentUpdate,
    token: string
  ) =>
    apiFetch<void>(
      `${wsBase(orgSlug, workspaceSlug)}/people/teams/${teamId}/roles/${assignmentId}`,
      { method: "PUT", body: JSON.stringify(body), token }
    ),

  addTeamAccountability: (
    orgSlug: string,
    workspaceSlug: string,
    teamId: string,
    body: AccountabilityCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/teams/${teamId}/accountabilities`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  deleteAccountability: (
    orgSlug: string,
    workspaceSlug: string,
    accountabilityId: string,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/accountabilities/${accountabilityId}`, {
      method: "DELETE",
      token,
    }),

  updateAccountability: (
    orgSlug: string,
    workspaceSlug: string,
    accountabilityId: string,
    body: AccountabilityUpdate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/people/accountabilities/${accountabilityId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),
};

// ─── Data Layer ──────────────────────────────────────────────────────────────

export const dataApi = {
  getEntity: (orgSlug: string, workspaceSlug: string, entityId: string, token: string) =>
    apiFetch<DataObjectDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/entities/${entityId}`, { token }),

  createEntity: (orgSlug: string, workspaceSlug: string, body: DataObjectCreate, token: string) =>
    apiFetch<DataObjectDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/entities`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateEntity: (
    orgSlug: string,
    workspaceSlug: string,
    entityId: string,
    body: DataObjectUpdate,
    token: string
  ) =>
    apiFetch<DataObjectDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/entities/${entityId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  addEntityLink: (
    orgSlug: string,
    workspaceSlug: string,
    entityId: string,
    body: DataLinkCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/data/entities/${entityId}/links`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  getStore: (orgSlug: string, workspaceSlug: string, storeId: string, token: string) =>
    apiFetch<DataStoreDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/stores/${storeId}`, { token }),

  createStore: (orgSlug: string, workspaceSlug: string, body: DataStoreCreate, token: string) =>
    apiFetch<DataStoreDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/stores`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateStore: (
    orgSlug: string,
    workspaceSlug: string,
    storeId: string,
    body: DataStoreUpdate,
    token: string
  ) =>
    apiFetch<DataStoreDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/stores/${storeId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  addStoreLink: (
    orgSlug: string,
    workspaceSlug: string,
    storeId: string,
    body: DataLinkCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/data/stores/${storeId}/links`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  getDomain: (orgSlug: string, workspaceSlug: string, domainId: string, token: string) =>
    apiFetch<DataDomainDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/domains/${domainId}`, { token }),

  createDomain: (orgSlug: string, workspaceSlug: string, body: DataDomainCreate, token: string) =>
    apiFetch<DataDomainDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/domains`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateDomain: (
    orgSlug: string,
    workspaceSlug: string,
    domainId: string,
    body: DataDomainUpdate,
    token: string
  ) =>
    apiFetch<DataDomainDetail>(`${wsBase(orgSlug, workspaceSlug)}/data/domains/${domainId}`, {
      method: "PUT",
      body: JSON.stringify(body),
      token,
    }),

  addDomainLink: (
    orgSlug: string,
    workspaceSlug: string,
    domainId: string,
    body: DataLinkCreate,
    token: string
  ) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/data/domains/${domainId}/links`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  deleteLink: (orgSlug: string, workspaceSlug: string, linkId: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/data/links/${linkId}`, {
      method: "DELETE",
      token,
    }),

  getFlowEndpointCatalog: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<FlowEndpointCatalog>(`${wsBase(orgSlug, workspaceSlug)}/data/flow-endpoint-catalog`, {
      token,
    }),
};

// ─── AI ──────────────────────────────────────────────────────────────────────

export type AskItem = {
  id: string;
  name: string;
  type: string;
  type_label: string;
  vendor: string;
  product: string;
  owner_team: string;
  owner_person: string;
  annual_cost: number | null;
  hosting: string;
  renewal_date: string;
};

export type AskModelPayload = {
  source: "llm" | "fallback";
  fallback_reason: string | null;
  answer_text: string | null;
  intent?: string;
  verdict?: { text: string; inferred: boolean; basis?: string[] } | null;
  evidence?: { text: string; citation_ids: string[] }[];
  fix_actions?: { record_id: string; field: "criticality" | "owner"; suggested_value: string }[];
  citations: {
    n: number;
    record_id: string;
    name: string;
    type_label: string;
    kind: string;
    owner: string;
    criticality: string;
    relationship: string;
  }[];
  gaps: { record_id: string; field: string; message: string }[];
  follow_ups: string[];
  tools_used: string[];
  unsupported?: boolean;
  /** Yes/no questions: the model's yes or no (the card leads with it). */
  yes_no?: "yes" | "no";
  headline?: string;
  /** Every item the AI's answer is about, and those items as real data (labels only). */
  item_ids?: string[];
  items?: AskItem[];
  /** What the server actually did, built from the lookup results (newer APIs only). */
  steps?: AskStep[];
  /** Server timing (measurement only); `summary` is the compact line for "How this was worked out". */
  timing?: { summary?: string } & Record<string, unknown>;
  /** Vendor answers: every named vendor (same definition as the Ask header), built by the server. */
  /** Step 3 rich blocks, built by the server from lookup results. */
  summary?: string;
  table?: import("@/lib/ask/rich").RichPayload["table"];
  chart?: import("@/lib/ask/rich").RichPayload["chart"];
  vendor_table?: { vendor: string; annual_cost: number | null; share_pct: number | null; record_ids: string[]; names: string[] }[];
  /** filter_records' filters (same keys as lib/ask/record-filter.ts), shown as editable chips. */
  filters?: Record<string, string | number | boolean>;
  /** fallback_reason "limit": the org's AI questions this month. */
  quota?: { plan: string; used: number; limit: number; month: string };
};

/** One working step of an Ask answer, e.g. "6 Applications renew in the next 90 days, $210,000 a year". */
export type AskStep = {
  id: string;
  status: "running" | "done" | "error";
  label: string;
  counts?: Record<string, number>;
  tool?: string;
};

export const aiApi = {
  /** context: earlier turns of the conversation on the answer page (last 4; the server re-checks ids). */
  ask: (orgSlug: string, workspaceSlug: string, question: string, token: string, context: AskContextTurn[] = []) =>
    apiFetch<AskModelPayload>(`${wsBase(orgSlug, workspaceSlug)}/ai/ask`, {
      method: "POST",
      body: JSON.stringify(context.length ? { question, context } : { question }),
      token,
    }),

  /** POST /ai/ask/stream with live steps and checked text; falls back to ask() once if the stream breaks. */
  askStream: (
    orgSlug: string,
    workspaceSlug: string,
    question: string,
    token: string,
    handlers: StreamHandlers & { signal?: AbortSignal; context?: AskContextTurn[] } = {}
  ) =>
    askWithStream({
      url: apiV1Url(`${wsBase(orgSlug, workspaceSlug)}/ai/ask/stream`),
      token,
      question,
      revealMs: 0, // the answer card reveals the text (lib/ask/reveal.ts)
      ...handlers,
      fallback: () => aiApi.ask(orgSlug, workspaceSlug, question, token, handlers.context ?? []),
    }),

  ingest: (orgSlug: string, workspaceSlug: string, text: string, token: string) =>
    apiFetch<CisPayload>(`${wsBase(orgSlug, workspaceSlug)}/ai/ingest`, {
      method: "POST",
      body: JSON.stringify({ text }),
      token,
    }),

  commitIngest: (orgSlug: string, workspaceSlug: string, payload: object, token: string) =>
    apiFetch<{ created_objects: string[]; created_relationships: string[] }>(
      `${wsBase(orgSlug, workspaceSlug)}/ai/ingest/commit`,
      { method: "POST", body: JSON.stringify(payload), token }
    ),

  generateInsights: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<{ generated: number }>(`${wsBase(orgSlug, workspaceSlug)}/ai/insights/generate`, {
      method: "POST",
      token,
    }),

  listInsights: async (orgSlug: string, workspaceSlug: string, token: string) => {
    const res = await apiFetch<AiInsightsResponse | AiInsight[]>(
      `${wsBase(orgSlug, workspaceSlug)}/ai/insights`,
      { token }
    );
    if (Array.isArray(res)) {
      return {
        insights: res,
        analysed_at: res[0]?.created_at ?? null,
        count: res.length,
      } satisfies AiInsightsResponse;
    }
    const insights = res.insights ?? [];
    return {
      insights,
      analysed_at: res.analysed_at ?? insights[0]?.created_at ?? null,
      count: res.count ?? insights.length,
    } satisfies AiInsightsResponse;
  },

  piiAgents: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<MinEAObject[]>(`${wsBase(orgSlug, workspaceSlug)}/ai/governance/pii-agents`, { token }),

  autonomousRisks: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<MinEAObject[]>(`${wsBase(orgSlug, workspaceSlug)}/ai/governance/autonomous-risks`, { token }),
};
