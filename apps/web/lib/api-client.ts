import type {
  MinEAObject,
  ObjectCreate,
  ObjectUpdate,
  ObjectListResponse,
  Relationship,
  RelationshipCreate,
  Workspace,
  WorkspaceCreate,
  AiInsight,
  CisPayload,
} from "@minea/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const { token, ...fetchInit } = init ?? {};
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchInit.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "API error");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Objects ─────────────────────────────────────────────────────────────────

export const objectsApi = {
  list: (params: { workspace_id: string; type?: string; status?: string; search?: string; page?: number }, token: string) => {
    const qs = new URLSearchParams({ workspace_id: params.workspace_id });
    if (params.type) qs.set("type", params.type);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    return apiFetch<ObjectListResponse>(`/objects?${qs}`, { token });
  },

  get: (id: string, token: string) => apiFetch<MinEAObject>(`/objects/${id}`, { token }),

  create: (body: ObjectCreate, token: string) =>
    apiFetch<MinEAObject>("/objects", { method: "POST", body: JSON.stringify(body), token }),

  update: (id: string, body: ObjectUpdate, token: string) =>
    apiFetch<MinEAObject>(`/objects/${id}`, { method: "PUT", body: JSON.stringify(body), token }),

  delete: (id: string, token: string) =>
    apiFetch<void>(`/objects/${id}`, { method: "DELETE", token }),
};

// ─── Relationships ────────────────────────────────────────────────────────────

export const relationshipsApi = {
  list: (params: { workspace_id: string; from_object_id?: string; to_object_id?: string }, token: string) => {
    const qs = new URLSearchParams({ workspace_id: params.workspace_id });
    if (params.from_object_id) qs.set("from_object_id", params.from_object_id);
    if (params.to_object_id) qs.set("to_object_id", params.to_object_id);
    return apiFetch<Relationship[]>(`/relationships?${qs}`, { token });
  },

  create: (body: RelationshipCreate, token: string) =>
    apiFetch<Relationship>("/relationships", { method: "POST", body: JSON.stringify(body), token }),

  delete: (id: string, token: string) =>
    apiFetch<void>(`/relationships/${id}`, { method: "DELETE", token }),
};

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspacesApi = {
  list: (token: string) => apiFetch<Workspace[]>("/workspaces", { token }),
  get: (id: string, token: string) => apiFetch<Workspace>(`/workspaces/${id}`, { token }),
  create: (body: WorkspaceCreate, token: string) =>
    apiFetch<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(body), token }),
  update: (id: string, body: Partial<WorkspaceCreate>, token: string) =>
    apiFetch<Workspace>(`/workspaces/${id}`, { method: "PUT", body: JSON.stringify(body), token }),
  context: (id: string, token: string) => apiFetch<object>(`/workspaces/${id}/context`, { token }),
};

// ─── AI ──────────────────────────────────────────────────────────────────────

export const aiApi = {
  ingest: (workspace_id: string, text: string, token: string) =>
    apiFetch<CisPayload>("/ai/ingest", { method: "POST", body: JSON.stringify({ workspace_id, text }), token }),

  commitIngest: (payload: object, token: string) =>
    apiFetch<{ created_objects: string[]; created_relationships: string[] }>("/ai/ingest/commit", {
      method: "POST",
      body: JSON.stringify(payload),
      token,
    }),

  generateInsights: (workspace_id: string, token: string) =>
    apiFetch<{ generated: number }>(`/ai/insights/generate?workspace_id=${workspace_id}`, { method: "POST", token }),

  listInsights: (workspace_id: string, token: string) =>
    apiFetch<AiInsight[]>(`/ai/insights?workspace_id=${workspace_id}`, { token }),

  piiAgents: (workspace_id: string, token: string) =>
    apiFetch<MinEAObject[]>(`/ai/governance/pii-agents?workspace_id=${workspace_id}`, { token }),

  autonomousRisks: (workspace_id: string, token: string) =>
    apiFetch<MinEAObject[]>(`/ai/governance/autonomous-risks?workspace_id=${workspace_id}`, { token }),
};
