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
  workspace_id: string;
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
  workspace_id: string;
  type: RelationshipType;
  from_object_id: string;
  from_type: ObjectType;
  to_object_id: string;
  to_type: ObjectType;
  attributes?: Record<string, unknown>;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  template_id?: string | null;
  biz_layer_term: string;
  app_layer_term: string;
  constraint_mode: "guided" | "strict" | "freeflow";
  created_at: string;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "starter" | "growth" | "business";
  created_at: string;
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
