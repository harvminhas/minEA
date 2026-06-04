import type {
  MinEAObject,
  ObjectCreate,
  ObjectUpdate,
  ObjectHistoryResponse,
  ObjectListResponse,
  Relationship,
  RelationshipCreate,
  Workspace,
  WorkspaceCreate,
  WorkspaceSnapshot,
  WorkspaceSummary,
  AiInsight,
  AiInsightsResponse,
  CisPayload,
  Org,
  OrgCreate,
  OrgMember,
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
} from "@minea/types";
import { apiV1Url } from "@/lib/api-base";

function wsBase(orgSlug: string, workspaceSlug: string) {
  return `/orgs/${orgSlug}/workspaces/${workspaceSlug}`;
}

async function apiFetch<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const { token, ...fetchInit } = init ?? {};
  const res = await fetch(apiV1Url(path), {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchInit.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail =
      typeof err.detail === "string"
        ? err.detail
        : JSON.stringify(err.detail) ?? "API error";
    throw new Error(`${res.status} ${detail} (${path})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface VerificationEmailResult {
  message: string;
  email_sent: boolean;
  verification_link?: string | null;
}

export const authApi = {
  getDevVerificationLink: (token: string) =>
    apiFetch<{ message: string; verification_link: string }>("/auth/dev-verification-link", {
      method: "POST",
      token,
    }).then((result) => ({
      message: result.message,
      email_sent: false,
      verification_link: result.verification_link,
    })),
};

// ─── Orgs ────────────────────────────────────────────────────────────────────

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
  context: (orgSlug: string, workspaceSlug: string, token: string) =>
    apiFetch<object>(`${wsBase(orgSlug, workspaceSlug)}/context`, { token }),
};

// ─── Objects ─────────────────────────────────────────────────────────────────

export const objectsApi = {
  list: (
    orgSlug: string,
    workspaceSlug: string,
    params: { type?: string; status?: string; search?: string; page?: number },
    token: string
  ) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set("type", params.type);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
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

  delete: (orgSlug: string, workspaceSlug: string, id: string, token: string) =>
    apiFetch<void>(`${wsBase(orgSlug, workspaceSlug)}/objects/${id}`, { method: "DELETE", token }),

  history: (orgSlug: string, workspaceSlug: string, objectId: string, token: string) =>
    apiFetch<ObjectHistoryResponse>(
      `${wsBase(orgSlug, workspaceSlug)}/objects/${objectId}/history`,
      { token }
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

export const aiApi = {
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
