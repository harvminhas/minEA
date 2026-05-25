// ─── Object Types ────────────────────────────────────────────────────────────

export type ObjectType =
  // Business Layer
  | "capability"
  | "value_stream"
  // Application Layer
  | "application"
  | "solution"
  | "technical_capability"
  | "agent"
  // Data Layer
  | "data_object"
  | "data_store"
  // Integration Layer
  | "api"
  | "event"
  | "integration_flow"
  | "message_broker"
  | "tool"
  // Infrastructure Layer
  | "cloud_service"
  | "model";

export type ObjectStatus =
  | "planned"
  | "active"
  | "retiring"
  | "retired"
  | "deprecated"
  | "under_evaluation";

export type ObjectSource = "user" | "ai_extraction" | "import";

// ─── Layer Config ─────────────────────────────────────────────────────────────

export type Layer = "business" | "application" | "data" | "integration" | "infrastructure";

export const LAYER_CONFIG: Record<Layer, {
  label: string;
  color: string;
  types: ObjectType[];
}> = {
  business: {
    label: "Business",
    color: "blue",
    types: ["capability", "value_stream"],
  },
  application: {
    label: "Application",
    color: "indigo",
    types: ["application", "solution", "technical_capability", "agent"],
  },
  data: {
    label: "Data",
    color: "amber",
    types: ["data_object", "data_store"],
  },
  integration: {
    label: "Integration",
    color: "teal",
    types: ["api", "event", "integration_flow", "message_broker", "tool"],
  },
  infrastructure: {
    label: "Infrastructure",
    color: "slate",
    types: ["cloud_service", "model"],
  },
};

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  capability: "Capability",
  value_stream: "Value Stream",
  application: "Application",
  solution: "Solution",
  technical_capability: "Technical Capability",
  agent: "AI Agent",
  data_object: "Data Object",
  data_store: "Data Store",
  api: "API",
  event: "Event",
  integration_flow: "Integration Flow",
  message_broker: "Message Broker",
  tool: "Tool",
  cloud_service: "Cloud Service",
  model: "Model",
};

export const GROWTH_TYPES: ObjectType[] = ["agent", "tool", "model"];

// ─── Core Object ─────────────────────────────────────────────────────────────

export interface MinEAObject {
  id: string;
  workspace_id: string;
  org_id: string;
  type: ObjectType;
  name: string;
  description?: string | null;
  owner?: string | null;
  status?: ObjectStatus | null;
  tags: string[];
  external_id?: string | null;
  source?: ObjectSource | null;
  confidence?: number | null;
  properties: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObjectCreate {
  type: ObjectType;
  name: string;
  description?: string;
  owner?: string;
  status?: ObjectStatus;
  tags?: string[];
  external_id?: string;
  properties?: Record<string, unknown>;
}

export interface ObjectUpdate {
  name?: string;
  description?: string;
  owner?: string;
  status?: ObjectStatus;
  tags?: string[];
  properties?: Record<string, unknown>;
}

// ─── Typed Property Schemas ───────────────────────────────────────────────────

export interface CapabilityProperties {
  parent_id?: string;
  maturity?: 1 | 2 | 3 | 4 | 5;
  investment?: "low" | "medium" | "high";
  order_index?: number;
}

export interface ApplicationProperties {
  vendor?: string;
  category?: string;
  hosting_model?: "cloud" | "on_premise" | "hybrid" | "saas";
  annual_cost?: number;
}

export interface AgentProperties {
  autonomy_level?: "suggest" | "act_with_approval" | "act_autonomously";
  scope?: string;
  human_escalation_point?: string;
  eu_ai_act_risk_class?: "minimal" | "limited" | "high" | "unacceptable";
}

export interface DataObjectProperties {
  classification?: "public" | "internal" | "confidential" | "pii" | "restricted";
}

export interface DataStoreProperties {
  store_type?: "relational_db" | "document_db" | "data_warehouse" | "data_lake" | "file_store" | "cache";
}

export interface ApiProperties {
  protocol?: "rest" | "graphql" | "grpc" | "soap";
}

export interface IntegrationFlowProperties {
  direction?: "inbound" | "outbound" | "bidirectional";
  protocol?: string;
  frequency?: "realtime" | "batch" | "scheduled" | "event_driven";
  criticality?: "low" | "medium" | "high" | "critical";
}

export interface ToolProperties {
  action_type?: "read" | "write" | "external_side_effect";
  reversibility?: "reversible" | "irreversible";
  auth_mechanism?: string;
  cost_per_call?: number;
}

export interface CloudServiceProperties {
  provider?: "aws" | "azure" | "gcp" | "other";
  service_type?: string;
}

export interface ModelProperties {
  provider?: string;
  model_version?: string;
  version_pin_policy?: "pinned" | "latest" | "rolling";
  cost_per_million_tokens_input?: number;
  cost_per_million_tokens_output?: number;
  data_residency?: string;
}

// ─── Relationship Types ───────────────────────────────────────────────────────

export type RelationshipType =
  | "depends_on"
  | "part_of"
  | "calls"
  | "uses"
  | "contains"
  | "connects"
  | "routes"
  | "supported_by"
  | "exposes"
  | "publishes"
  | "consumes"
  | "subscribes"
  | "stores_in"
  | "runs_on"
  | "affects"
  | "replaces"
  | "uses_model"
  | "can_call"
  | "supports"
  | "escalates_to"
  | "accesses"
  | "connects_to";

export interface Relationship {
  id: string;
  workspace_id: string;
  org_id: string;
  type: RelationshipType;
  from_object_id: string;
  from_type: ObjectType;
  to_object_id: string;
  to_type: ObjectType;
  attributes: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

export interface RelationshipCreate {
  type: RelationshipType;
  from_object_id: string;
  from_type: ObjectType;
  to_object_id: string;
  to_type: ObjectType;
  attributes?: Record<string, unknown>;
}

// ─── Tenancy ─────────────────────────────────────────────────────────────────

export type OrgRole = "owner" | "admin" | "member";
export type WorkspaceRole = "admin" | "member" | "viewer";
export type InviteRole = "admin" | "member" | "viewer";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface LimitExceededError {
  code: "limit_exceeded";
  limit: string;
  current: number;
  max: number;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "starter" | "growth" | "business";
  role: OrgRole;
  created_at: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: OrgRole;
  joined_at: string;
}

export interface OrgCreate {
  name: string;
  slug: string;
  workspace_name?: string;
  workspace_slug?: string;
}

export interface InvitePreview {
  org_name: string;
  org_slug: string;
  email: string;
  role: InviteRole;
  workspace_slug?: string | null;
  status: InviteStatus;
  expired: boolean;
  consumed: boolean;
}

export interface Invite {
  id: string;
  email: string;
  role: InviteRole;
  workspace_id?: string | null;
  status: InviteStatus;
  expires_at: string;
  consumed_at?: string | null;
  created_at: string;
}

export interface InviteCreated extends Invite {
  invite_url: string;
  token: string;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  template_id?: string | null;
  biz_layer_term: string;
  app_layer_term: string;
  constraint_mode: "guided" | "strict" | "freeflow";
  role?: WorkspaceRole | null;
  created_at: string;
}

export interface WorkspaceCreate {
  name: string;
  slug: string;
  template_id?: string;
  biz_layer_term?: string;
  app_layer_term?: string;
  constraint_mode?: "guided" | "strict" | "freeflow";
}

/** @deprecated Use Org */
export type Organisation = Org;

export type ProductLifecycle = "planned" | "live" | "beta" | "retiring" | "retired";
export type RealizationMaturity = "manual" | "partial" | "automated" | "outsourced";

export interface Product {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  product_line?: string | null;
  lifecycle: ProductLifecycle | string;
  owner?: string | null;
  description?: string | null;
  capability_count: number;
  system_count: number;
  api_count: number;
  data_store_count: number;
  maturity_indicator?: RealizationMaturity | null;
  capability_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ProductCreate {
  name: string;
  product_line?: string;
  lifecycle?: string;
  owner?: string;
  description?: string;
  capability_ids?: string[];
}

export interface ProductListResponse {
  items: Product[];
  total: number;
}

export interface ProductGraphNode {
  id: string;
  label: string;
  type: string;
  layer: number;
}

export interface ProductGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface ProductGraphResponse {
  nodes: ProductGraphNode[];
  edges: ProductGraphEdge[];
}

export type ProcessStatus = "draft" | "live" | "planned" | "retiring" | "retired";

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface ProcessCanvasLayout {
  nodes: (CanvasPoint | null)[];
  edge_labels: (CanvasPoint | null)[] | Record<string, CanvasPoint>;
}

export interface ProcessGraphEdge {
  source_index: number;
  target_index: number;
  condition?: string | null;
  trigger?: string | null;
  handoff?: string | null;
}

export interface ProcessStage {
  id: string;
  name: string;
  position: number;
  owner?: string | null;
  cycle_time_target?: number | null;
  typical_duration?: string | null;
  transition_condition?: string | null;
  transition_trigger?: string | null;
  transition_handoff?: string | null;
  capability_ids: string[];
}

export interface Process {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  owner?: string | null;
  status: ProcessStatus | string;
  description?: string | null;
  trigger_event?: string | null;
  value_delivered?: string | null;
  stage_count: number;
  capability_count: number;
  stages: ProcessStage[];
  canvas_layout?: ProcessCanvasLayout | null;
  graph_edges?: ProcessGraphEdge[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessStageCreate {
  name: string;
  position?: number;
  owner?: string;
  cycle_time_target?: number;
  typical_duration?: string;
  transition_condition?: string;
  transition_trigger?: string;
  transition_handoff?: string;
  capability_ids?: string[];
}

export interface ProcessCreate {
  name: string;
  owner?: string;
  status?: string;
  description?: string;
  trigger_event?: string;
  value_delivered?: string;
  canvas_layout?: ProcessCanvasLayout | null;
  graph_edges?: ProcessGraphEdge[] | null;
  stages?: ProcessStageCreate[];
}

export interface ProcessListResponse {
  items: Process[];
  total: number;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AiInsight {
  id: string;
  workspace_id: string;
  org_id: string;
  type: "gap" | "risk" | "recommendation";
  title: string;
  description: string;
  severity?: "low" | "medium" | "high" | null;
  affected_object_ids: string[];
  created_at: string;
}

export interface CisObject {
  local_id: string;
  type: ObjectType;
  name: string;
  description?: string;
  properties?: Record<string, unknown>;
}

export interface CisRelationship {
  local_id: string;
  type: RelationshipType;
  from_local_id: string;
  to_local_id: string;
  attributes?: Record<string, unknown>;
}

export interface CisPayload {
  objects: CisObject[];
  relationships: CisRelationship[];
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type ObjectListResponse = PaginatedResponse<MinEAObject>;
