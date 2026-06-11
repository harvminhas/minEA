// ─── Object Types ────────────────────────────────────────────────────────────

export type ObjectType =
  // Business Layer
  | "business_domain"
  | "capability"
  | "value_stream"
  // Strategy Layer
  | "roadmap_item"
  // Application Layer
  | "application"
  | "solution"
  | "technical_capability"
  | "component"
  | "agent"
  // Data Layer
  | "data_object"
  | "data_store"
  | "data_domain"
  // Integration Layer
  | "api"
  | "event"
  | "integration_flow"
  | "message_broker"
  | "tool"
  // Infrastructure Layer
  | "cloud_service"
  | "model"
  // Risk Layer
  | "tech_debt";

export type ObjectStatus =
  | "planned"
  | "active"
  | "retiring"
  | "retired"
  | "deprecated"
  | "under_evaluation";

export type ObjectSource = "user" | "ai_extraction" | "import";

/** How an entity relates to AI workloads. "none" is the default and is usually omitted when stored. */
export type AiRole =
  | "none"
  | "model"
  | "ai_powered"
  | "ai_infrastructure"
  | "ai_adjacent";

// ─── Layer Config ─────────────────────────────────────────────────────────────

export type Layer = "strategy" | "business" | "application" | "data" | "integration" | "infrastructure";

export const LAYER_CONFIG: Record<Layer, {
  label: string;
  color: string;
  types: ObjectType[];
}> = {
  strategy: {
    label: "Strategy",
    color: "violet",
    types: ["business_domain", "capability", "value_stream", "roadmap_item"],
  },
  business: {
    label: "Business",
    color: "blue",
    types: [],
  },
  application: {
    label: "Application",
    color: "indigo",
    types: ["application", "solution", "technical_capability", "component", "agent"],
  },
  data: {
    label: "Data",
    color: "amber",
    types: ["data_object", "data_store", "data_domain"],
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
  business_domain: "Domain",
  capability: "Capability",
  value_stream: "Value Stream",
  roadmap_item: "Roadmap Item",
  application: "Application",
  solution: "Solution",
  technical_capability: "Technical Capability",
  component: "Component",
  agent: "AI Agent",
  data_object: "Data Entity",
  data_store: "Data Store",
  data_domain: "Data Domain",
  api: "API",
  event: "Event",
  integration_flow: "Flow",
  message_broker: "Message Broker",
  tool: "Tool",
  cloud_service: "Cloud Service",
  model: "Model",
  tech_debt: "Tech Debt",
};

export const GROWTH_TYPES: ObjectType[] = ["agent", "tool", "model"];

// ─── Core Object ─────────────────────────────────────────────────────────────

export interface ObjectHistoryEntry {
  id: string;
  actor_name: string;
  action: string;
  detail?: string | null;
  created_at: string;
}

export interface ObjectHistoryResponse {
  entries: ObjectHistoryEntry[];
}

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
  /** Populated for application / solution / technical_capability */
  updated_by_name?: string | null;
  capability_count?: number;
  apis_provided_count?: number;
  apis_consumed_count?: number;
  data_store_count?: number;
  /** Open tech debt items attached to this object (repository cards). */
  open_tech_debt_count?: number;
  /** Populated when listing tech_debt objects (Views → Tech debt). */
  tech_debt_rollup_products?: ObjectTechDebtRollupProduct[];
  tech_debt_remediation?: { roadmap_id: string; roadmap_title: string } | null;
  /** Populated for data_object / data_store / data_domain cards */
  data_domain_name?: string | null;
  system_of_record_name?: string | null;
  hosting_system_name?: string | null;
  governed_entity_count?: number;
  governed_store_count?: number;
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

export interface DomainProperties {
  order_index?: number;
  icon?: string;
  source_template_id?: string;
  /** Systems shown as columns on the domain mapping grid */
  mapping_system_ids?: string[];
}

export interface CapabilityProperties {
  domain_id: string;
  maturity?: 1 | 2 | 3 | 4 | 5;
  investment?: "low" | "medium" | "high";
  order_index?: number;
}

export interface PlatformRef {
  platform_id: string;
  platform_name: string;
}

export interface ApplicationProperties {
  vendor?: string;
  category?: string;
  hosting_model?: "cloud" | "on_premise" | "hybrid" | "saas";
  annual_cost?: number;
  /** Enterprise platform this system is built on (synced via runs_on relationship). */
  platform?: PlatformRef | null;
  /** How this entity relates to AI workloads. Omitted or "none" = not AI-related. */
  ai_role?: AiRole;
  /** Persisted node positions for the system relationship canvas. */
  node_layout?: Record<string, { x: number; y: number }>;
}

export interface AgentProperties {
  autonomy_level?: "suggest" | "act_with_approval" | "act_autonomously";
  scope?: string;
  human_escalation_point?: string;
  eu_ai_act_risk_class?: "minimal" | "limited" | "high" | "unacceptable";
}

export interface DataObjectProperties {
  classification?: "core" | "reference" | "public" | "internal" | "confidential" | "pii" | "restricted";
  sensitivity?: string;
  data_domain_id?: string;
}

export interface DataStoreProperties {
  store_type?: "relational_db" | "document_db" | "data_warehouse" | "data_lake" | "file_store" | "cache";
  technology?: string;
  health?: "healthy" | "at_risk" | "degraded";
  data_domain_id?: string;
}

export interface DataDomainProperties {
  classification?: string;
  owning_team?: string;
  steward_name?: string;
  steward_email?: string;
  capability_domain_id?: string;
}

export interface ApiProperties {
  /** API style / protocol */
  protocol?: "rest" | "graphql" | "grpc" | "soap";
  version?: string;
  base_url?: string;
  auth?: string;
  provider?: ApiProviderRef | null;
  consumers?: ApiConsumerRef[];
  gateway?: ApiGatewayRef | null;
  audience?: "internal" | "partner" | "public";
  criticality?: "low" | "medium" | "high" | "critical";
  /** Persisted node positions for the API architecture canvas. */
  node_layout?: Record<string, { x: number; y: number }>;
}

export interface ApiProviderRef {
  provider_id: string;
  provider_name: string;
  provider_kind: "application" | "component";
  /** Parent system when provider is a component */
  system_name?: string;
}

export interface ApiConsumerRef {
  consumer_id?: string;
  consumer_name: string;
  consumer_kind: "application" | "custom";
}

export interface ApiGatewayRef {
  /** Set when linked to a registered tool (api gateway instance) */
  gateway_id?: string;
  gateway_name: string;
  platform?: "apigee" | "kong" | "aws_api_gateway";
}

export interface EventProducerRef {
  producer_id: string;
  producer_name: string;
  producer_kind: "application" | "component" | "data_object";
  /** Parent system when producer is a component */
  system_name?: string;
}

export interface EventSubscriberRef {
  subscriber_id?: string;
  subscriber_name: string;
  subscriber_kind: "application" | "component" | "custom";
}

export interface EventBrokerRef {
  /** Set when linked to a registered message_broker object */
  broker_id?: string;
  broker_name: string;
  broker_kind?: "tool" | "message_broker";
  transport?: "kafka" | "eventbridge" | "pub_sub" | "rabbitmq" | "solace";
}

export interface EventProperties {
  /** Technical topic / event name on the broker */
  topic?: string;
  version?: string;
  schema_ref?: string;
  delivery?: "at_least_once" | "at_most_once" | "exactly_once";
  producer?: EventProducerRef | null;
  subscribers?: EventSubscriberRef[];
  broker?: EventBrokerRef | null;
  audience?: "internal" | "partner" | "public";
  criticality?: "low" | "medium" | "high" | "critical";
  /** Persisted node positions for the event architecture canvas. */
  node_layout?: Record<string, { x: number; y: number }>;
}

export interface FlowCarrierRef {
  /** Integration infrastructure tool that moves this flow */
  carrier_id?: string;
  carrier_name: string;
}

export interface IntegrationFlowProperties {
  direction?: "one_way" | "bidirectional" | "inbound" | "outbound";
  protocol?: string;
  format?: string;
  frequency?: "realtime" | "batch" | "scheduled" | "event_driven";
  auth?: string;
  criticality?: "low" | "medium" | "high" | "critical";
  data_classification?: string;
  sources?: FlowEndpointSide;
  destinations?: FlowEndpointSide;
  carrier?: FlowCarrierRef | null;
  /** Persisted node positions for the flow diagram canvas. */
  node_layout?: Record<string, { x: number; y: number }>;
}

export interface ComponentSystemRef {
  system_id: string;
  system_name: string;
}

export interface ComponentRuntimeRef {
  runtime_id: string;
  runtime_name: string;
  runtime_kind: "tool" | "model" | "cloud_service";
}

export interface ComponentProperties {
  component_type?: string;
  tech_stack?: string;
  systems?: ComponentSystemRef[];
  runtime?: ComponentRuntimeRef | null;
  /** Enterprise platform this component is built on (synced via built_on relationship). */
  platform?: PlatformRef | null;
  /** How this entity relates to AI workloads. Omitted or "none" = not AI-related. */
  ai_role?: AiRole;
  /** Persisted node positions for the component architecture canvas. */
  node_layout?: Record<string, { x: number; y: number }>;
}

export interface FlowSystemSelection {
  system_id: string;
  system_name: string;
  wildcard: true;
}

export interface FlowEntitySelection {
  entity_id: string;
  entity_name: string;
  system_id?: string | null;
  system_name?: string | null;
}

export interface FlowEndpointSide {
  systems: FlowSystemSelection[];
  entities: FlowEntitySelection[];
}

export interface FlowEndpointSystem {
  id: string;
  name: string;
  category: string;
  vendor?: string | null;
  entity_count: number;
  connection_label?: string | null;
}

export interface FlowEndpointEntity {
  id: string;
  name: string;
  system_id?: string | null;
  system_name?: string | null;
  classification?: string | null;
  sensitivity?: string | null;
  registered: boolean;
}

export interface FlowEndpointCatalog {
  systems: FlowEndpointSystem[];
  entities: FlowEndpointEntity[];
}

export interface ToolProperties {
  action_type?: "read" | "write" | "external_side_effect";
  reversibility?: "reversible" | "irreversible";
  auth_mechanism?: string;
  cost_per_call?: number;
  /** API gateway registration (from API panel) */
  gateway_platform?: "apigee" | "kong" | "aws_api_gateway";
  /** Integration infrastructure (Technology → Integration Infra) */
  integration_infra_kind?: "ipaas" | "etl_elt" | "broker" | "gateway" | "transport" | "custom";
  integration_infra_kind_other?: string;
  /** What integration object types this carrier can link to (APIs, events, flows, data). */
  integration_infra_handles?: Array<"apis" | "events" | "flows" | "data">;
  vendor?: string;
  vendor_product?: string;
  hosting_model?: "saas" | "self_hosted" | "hybrid";
  region?: string;
  environments?: string[];
  admin_url?: string;
  license_model?: "per_vcore" | "per_connector" | "per_message_volume" | "flat_enterprise" | "open_source";
  contract_renewal?: string;
  annual_cost?: string;
  sla_target?: "99_9" | "99_95" | "99_99" | "best_effort";
  lifecycle?: "pilot" | "active" | "deprecated" | "end_of_life";
  criticality?: "low" | "medium" | "high" | "tier1";
  /** Persisted node positions for the integration infra relationship diagram. */
  node_layout?: Record<string, { x: number; y: number }>;
}

export interface CloudServiceProperties {
  provider?: "aws" | "azure" | "gcp" | "other";
  service_type?: string;
  /** Enterprise platform (Technology → Platforms) */
  vendor?: string;
  vendor_product?: string;
  platform_type?: "low_code" | "itsm" | "crm" | "erp" | "bpm" | "custom_dev" | "other";
  platform_type_other?: string;
  hosting_model?: "saas" | "paas" | "self_hosted" | "hybrid";
  region?: string;
  environments?: string[];
  admin_url?: string;
  license_model?: "per_user" | "per_capacity" | "per_api_call" | "flat_enterprise" | "open_source";
  contract_renewal?: string;
  annual_cost?: string;
  sla_target?: "99_9" | "99_95" | "99_99" | "best_effort";
  lifecycle?: "pilot" | "active" | "deprecated" | "end_of_life";
  criticality?: "low" | "medium" | "high" | "tier1";
}

export interface ModelProperties {
  provider?: string;
  model_version?: string;
  version_pin_policy?: "pinned" | "latest" | "rolling";
  cost_per_million_tokens_input?: number;
  cost_per_million_tokens_output?: number;
  data_residency?: string;
  /** Technology → Runtimes (compute / hosting) */
  compute_runtime_kind?: "kubernetes" | "serverless" | "container" | "vm" | "paas" | "on_prem";
  runtime_provider?: string;
  service_product?: string;
  hosting_model?: "public_cloud" | "private_cloud" | "on_premise" | "hybrid";
  region?: string;
  environments?: string[];
  console_url?: string;
  cost_model?:
    | "per_vcpu_memory"
    | "per_instance_hour"
    | "per_invocation"
    | "reserved_committed"
    | "flat_enterprise"
    | "capex";
  commitment_ends?: string;
  annual_cost?: string;
  sla_target?: "99_9" | "99_95" | "99_99" | "best_effort";
  lifecycle?: "pilot" | "active" | "deprecated" | "end_of_life";
  criticality?: "low" | "medium" | "high" | "tier1";
}

export type TechDebtHostKind =
  | "product"
  | "application"
  | "solution"
  | "technical_capability"
  | "component"
  | "api"
  | "event"
  | "integration_flow"
  | "tool"
  | "data_object"
  | "data_store"
  | "data_domain"
  | "cloud_service"
  | "model";

export interface TechDebtAffectsRef {
  object_id: string;
  object_name: string;
  object_kind: TechDebtHostKind;
}

export interface TechDebtProperties {
  severity?: "low" | "medium" | "high" | "critical";
  debt_type?:
    | "eol_software"
    | "security_vulnerability"
    | "performance_scaling"
    | "missing_tests"
    | "outdated_dependency"
    | "compliance_gap"
    | "documentation"
    | "architecture_drift"
    | "vendor_contract"
    | "other";
  debt_type_other?: string;
  debt_status?: "open" | "in_progress" | "deferred" | "resolved" | "wont_fix";
  affects?: TechDebtAffectsRef | null;
  identified_by?: string;
  target_resolution?: string;
  effort_estimate?: "" | "s" | "m" | "l" | "xl";
}

export interface RoadmapProductRef {
  product_id: string;
  product_name: string;
}

export interface RoadmapDebtRef {
  debt_id: string;
  debt_name: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export type RoadmapMilestoneStatus = "not_started" | "in_flight" | "done";

/** @deprecated Legacy point-in-time milestones — replaced by tracks/segments. */
export interface RoadmapMilestone {
  id: string;
  title: string;
  target_resolution: string;
  status: RoadmapMilestoneStatus;
  sort_order?: number;
}

/** A labeled span on a roadmap track (e.g. "RFI", "Evaluate", "MSA"). */
export interface RoadmapSegment {
  id: string;
  label: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  start_date: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  end_date: string;
  status?: RoadmapMilestoneStatus;
  /** Hex override; defaults to the track color. */
  color?: string;
}

/** A user-named swimlane on a roadmap item (e.g. "Partner Sourcing"). */
export interface RoadmapTrack {
  id: string;
  label: string;
  /** Hex; assigned from palette when omitted. */
  color?: string;
  sort_order?: number;
  segments: RoadmapSegment[];
}

export interface RoadmapItemProperties {
  roadmap_kind?: "feature" | "epic" | "initiative" | "migration" | "sunset" | "discovery";
  product?: RoadmapProductRef | null;
  resolves_debt?: RoadmapDebtRef[];
  roadmap_status?:
    | "discovery"
    | "planned"
    | "in_progress"
    | "blocked"
    | "delivered"
    | "deferred"
    | "cancelled";
  target_resolution?: string;
  /** How the roadmap item is scoped on the timeline. */
  timeline_mode?: "date_bound" | "relative";
  /** ISO start date (date-bound mode). */
  timeline_start_date?: string;
  /** ISO end date (date-bound mode). */
  timeline_end_date?: string;
  /** Span length (relative mode). */
  timeline_duration?: number;
  timeline_unit?: "weeks" | "months" | "quarters";
  effort_estimate?: "" | "s" | "m" | "l" | "xl";
  /** Optional override; when absent, spend is estimated from effort × rate card. */
  cost?: number | null;
  investment_category?: "innovation" | "modernization" | "run";
  blocked_reason?: string | null;
  /** How this initiative relates to AI. Omitted or "none" = not AI-related. */
  ai_role?: AiRole;
  /** @deprecated Converted to tracks on first edit. */
  milestones?: RoadmapMilestone[];
  tracks?: RoadmapTrack[];
  /** Optional bounds that extend the auto-computed timeline range. */
  timeline_view?: RoadmapTimelineView;
}

/** Persisted extension of the visible timeline (beyond segment-derived bounds). */
export interface RoadmapTimelineView {
  start_date?: string;
  end_date?: string;
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
  | "hosts"
  | "carries"
  | "supported_by"
  | "exposes"
  | "publishes"
  | "consumes"
  | "subscribes"
  | "stores_in"
  | "runs_on"
  | "built_on"
  | "affects"
  | "resolves"
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

/** User-facing role definitions (org + workspace scopes). */
export const ROLE_DEFINITIONS = {
  owner: {
    scope: "org" as const,
    label: "Owner",
    description: "Full control, billing, delete org",
  },
  admin: {
    scope: "org" as const,
    label: "Admin",
    description: "Manage workspace, users, settings — no billing",
  },
  member: {
    scope: "workspace" as const,
    label: "Member",
    description: "Create and edit repository objects",
  },
  viewer: {
    scope: "workspace" as const,
    label: "Viewer",
    description: "Read-only access to repository and views",
  },
} as const;

export type PermissionSlug =
  | "org.settings.edit"
  | "org.member.invite"
  | "org.member.remove"
  | "org.role.assign"
  | "org.delete"
  | "org.billing.manage"
  | "org.transfer"
  | "workspace.create"
  | "workspace.settings.edit"
  | "workspace.member.invite"
  | "workspace.member.remove"
  | "workspace.delete"
  | "workspace.share.create"
  | "object.create"
  | "object.edit"
  | "object.delete"
  | "object.view";
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
  plan: "free" | "business";
  role: OrgRole;
  created_at: string;
}

export interface BillingStatus {
  plan: string;
  stripe_configured: boolean;
  can_upgrade_solo: boolean;
  has_subscription: boolean;
  own_workspace_count: number;
  own_workspace_limit: number | null;
  can_create_own_workspace: boolean;
  active_share_link_count: number;
  active_share_link_limit: number | null;
  can_create_share_link: boolean;
}

export interface SoloCheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: OrgRole;
  joined_at: string;
}

export type ShareResourceType =
  | "view"
  | "roadmap"
  | "object"
  | "capability_map"
  | "capability_domain";

export interface SharePreview {
  org_name: string;
  org_slug: string;
  workspace_name: string;
  workspace_slug: string;
  resource_type: ShareResourceType;
  resource_key: string | null;
  resource_id: string | null;
  title: string;
  status: string;
  expired: boolean;
  revoked: boolean;
  shared_by_name: string | null;
  expires_at: string | null;
}

export interface ShareLink {
  id: string;
  resource_type: ShareResourceType;
  resource_key: string | null;
  resource_id: string | null;
  title: string;
  status: string;
  expires_at: string;
  created_at: string;
  share_url?: string | null;
}

export interface ShareCreated extends ShareLink {
  token: string;
  share_url: string;
}

export interface ShareCreate {
  resource_type: ShareResourceType;
  resource_key?: string | null;
  resource_id?: string | null;
  title: string;
  expires_in_days?: number;
}

export interface WorkspaceMember {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: WorkspaceRole;
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
  /** Deep-clone content from this workspace (new IDs — no cross-workspace links). */
  source_workspace_slug?: string;
  copy_layers?: string[];
}

export interface WorkspaceCopyPreviewLayer {
  id: string;
  label: string;
  subtitle: string;
  count: number;
}

export interface WorkspaceCopyPreview {
  layers: WorkspaceCopyPreviewLayer[];
}

/** @deprecated Use Org */
export type Organisation = Org;

export type ProductLifecycle = "planned" | "live" | "beta" | "retiring" | "retired";
export type RealizationMaturity = "manual" | "partial" | "automated" | "outsourced";

export type ProductHealthStatus = "healthy" | "aging" | "at_risk" | "no_data";
export type ProductTrendDirection = "up" | "down" | "neutral" | "stable";

export interface ProductHealthFactor {
  id: string;
  label: string;
  severity: "critical" | "warning" | "info" | "ok";
  action: string;
}

export interface ProductHealthDimensions {
  ops: "healthy" | "warning" | "critical";
  debt: "healthy" | "warning" | "critical";
  lifecycle: "healthy" | "warning" | "critical";
  ownership: "healthy" | "warning" | "critical";
}

export interface ProductTechDebtRemediation {
  roadmap_id: string;
  roadmap_title: string;
}

export interface ObjectTechDebtRollupProduct {
  id: string;
  name: string;
}

export interface ObjectTechDebtSummary {
  open_count: number;
  items: ProductTechDebtItem[];
  rollup_products: ObjectTechDebtRollupProduct[];
}

export interface ProductTechDebtItem {
  id: string;
  name: string;
  severity: string;
  debt_type?: string | null;
  debt_type_label: string;
  age_days: number;
  affects_name: string;
  affects_kind: string;
  owner?: string | null;
  remediation?: ProductTechDebtRemediation | null;
}

export interface ProductRoadmapNextMilestone {
  title: string;
  target_label: string;
}

export interface ProductRoadmapItem {
  id: string;
  name: string;
  kind?: string | null;
  kind_label: string;
  status: string;
  status_label: string;
  target_label: string;
  owner?: string | null;
  product_name?: string | null;
  spend_label?: string;
  effort_label?: string;
  resolves_debt_count?: number;
  milestone_strip: { status: string }[];
  milestones_done: number;
  milestones_total: number;
  next_milestone?: ProductRoadmapNextMilestone | null;
  updated_at?: string;
  updated_by_name?: string | null;
}

export interface ProductIntegrationItem {
  id: string;
  name: string;
  kind: string;
}

export interface ProductHistoryEntry {
  id: string;
  actor_name: string;
  action: string;
  detail?: string | null;
  created_at: string;
}

export interface ProductHistoryResponse {
  entries: ProductHistoryEntry[];
}

export interface Product {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  product_line?: string | null;
  lifecycle: ProductLifecycle | string;
  owner?: string | null;
  description?: string | null;
  updated_by_name?: string | null;
  capability_count: number;
  system_count: number;
  apis_provided_count: number;
  apis_consumed_count: number;
  events_produced_count: number;
  events_subscribed_count: number;
  flows_in_count: number;
  flows_out_count: number;
  data_store_count: number;
  maturity_indicator?: RealizationMaturity | null;
  capability_ids: string[];
  graph_layout?: Record<string, { x: number; y: number }> | null;
  created_at: string;
  updated_at: string;
  /** Layer-1 portfolio cockpit signals */
  annual_cost_total?: number | null;
  open_tech_debt_count?: number;
  critical_tech_debt_count?: number;
  roadmap_status?: string | null;
  roadmap_count?: number;
  health_status?: ProductHealthStatus;
  health_factors?: ProductHealthFactor[];
  trend_direction?: ProductTrendDirection;
  trend_label?: string;
  /** Populated on GET /products/{id} */
  health_dimensions?: ProductHealthDimensions | null;
  tech_debt_items?: ProductTechDebtItem[];
  roadmap_items?: ProductRoadmapItem[];
  apis_provided?: ProductIntegrationItem[];
  apis_consumed?: ProductIntegrationItem[];
  events_produced?: ProductIntegrationItem[];
  events_subscribed?: ProductIntegrationItem[];
  flows_in?: ProductIntegrationItem[];
  flows_out?: ProductIntegrationItem[];
  data_stores?: ProductIntegrationItem[];
}

export interface ProductCreate {
  name: string;
  product_line?: string;
  lifecycle?: string;
  owner?: string;
  description?: string;
  capability_ids?: string[];
}

export interface ProductUpdate {
  name?: string;
  product_line?: string;
  lifecycle?: string;
  owner?: string;
  description?: string;
  capability_ids?: string[];
  graph_layout?: Record<string, { x: number; y: number }> | null;
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
  graph_layout?: Record<string, { x: number; y: number }> | null;
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

// ─── Journeys ────────────────────────────────────────────────────────────────

export interface JourneyGraphEdge {
  source_index: number;
  target_index: number;
  transition_description?: string | null;
  time_wait?: string | null;
  channel_switch?: string | null;
  dependency?: string | null;
  entry_criteria?: string | null;
}

export interface JourneyStep {
  id: string;
  title: string;
  position: number;
  channel?: string | null;
  goal?: string | null;
  pain_points?: string | null;
  owner?: string | null;
  ai_opportunities?: string | null;
  sentiment_friction?: string | null;
  process_ids: string[];
  system_ids: string[];
}

export interface Journey {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  owner?: string | null;
  status: string;
  customer_segment?: string | null;
  description?: string | null;
  step_count: number;
  process_count: number;
  steps: JourneyStep[];
  canvas_layout?: ProcessCanvasLayout | null;
  graph_edges?: JourneyGraphEdge[] | null;
  created_at: string;
  updated_at: string;
}

export interface JourneyStepCreate {
  title: string;
  position?: number;
  channel?: string;
  goal?: string;
  pain_points?: string;
  owner?: string;
  ai_opportunities?: string;
  sentiment_friction?: string;
  process_ids?: string[];
  system_ids?: string[];
}

export interface JourneyCreate {
  name: string;
  owner?: string;
  status?: string;
  customer_segment?: string;
  description?: string;
  canvas_layout?: ProcessCanvasLayout | null;
  graph_edges?: JourneyGraphEdge[] | null;
  steps?: JourneyStepCreate[];
}

export interface JourneyListResponse {
  items: Journey[];
  total: number;
}

export interface DerivedSystemsResponse {
  items: Array<{ id: string; name: string }>;
}

// ─── Capability Map ──────────────────────────────────────────────────────────

export interface CapabilityTemplateSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  domain_count: number;
  capability_count: number;
}

export interface CapabilityTemplateDomain {
  name: string;
  icon: string;
  capabilities: string[];
}

export interface CapabilityTemplateDetail extends CapabilityTemplateSummary {
  domains: CapabilityTemplateDomain[];
}

export interface CapabilityMapStatus {
  initialized: boolean;
  domain_count: number;
  capability_count: number;
}

/** Aggregated workspace metrics inside a snapshot payload. */
export interface WorkspaceSummary {
  domain_count: number;
  capability_count: number;
  system_count: number;
  product_count: number;
  process_count: number;
  journey_count: number;
  investment_count: number;
  map_initialized: boolean;
  incomplete_domain_count: number;
  capabilities_without_system_count: number;
  products_without_capabilities_count: number;
}

/** Postgres-derived workspace snapshot envelope. */
export interface WorkspaceSnapshot {
  version: number;
  built_at: string | null;
  stale: boolean;
  rebuilding: boolean;
  metrics: WorkspaceSummary;
}

export type CapabilityCoverageStatus = "active" | "planned" | "no_system";

export interface CapabilityMapCapability {
  id: string;
  name: string;
  domain_id: string;
  order_index?: number | null;
  maturity?: number | null;
  investment?: string | null;
  owner?: string | null;
  object_status?: string | null;
  system_count?: number;
  product_count?: number;
  coverage_status?: CapabilityCoverageStatus;
}

export interface CapabilityMapDomain {
  id: string;
  name: string;
  icon?: string | null;
  order_index?: number | null;
  source_template_id?: string | null;
  capabilities: CapabilityMapCapability[];
}

export interface CapabilityMap {
  initialized: boolean;
  domains: CapabilityMapDomain[];
}

export type HeatmapCellLevel = "empty" | "gap" | "strong" | "good" | "fair" | "poor" | "eol";

export interface HeatmapCell {
  level: HeatmapCellLevel | string;
  label: string;
}

export interface HeatmapCapabilityRow {
  id: string;
  name: string;
  status?: string | null;
  is_planned: boolean;
  cells: Record<string, HeatmapCell>;
  overlap: boolean;
  realising_count: number;
}

export interface HeatmapDomainGroup {
  id: string;
  name: string;
  icon?: string | null;
  capabilities: HeatmapCapabilityRow[];
}

export interface HeatmapProductColumn {
  id: string;
  name: string;
  short_code: string;
  abbrev: string;
  lifecycle: string;
  color: string;
  capability_ids: string[];
}

export interface HeatmapGapItem {
  capability_name: string;
  domain_name: string;
  detail: string;
}

export interface HeatmapHotSpot {
  capability_name: string;
  detail: string;
}

export interface HeatmapSummary {
  capability_count: number;
  product_count: number;
  gap_count: number;
  overlap_count: number;
  gaps: HeatmapGapItem[];
  overlaps: { count: number; names: string[] };
  hot_spots: HeatmapHotSpot[];
}

export interface CapabilityHeatmap {
  products: HeatmapProductColumn[];
  domains: HeatmapDomainGroup[];
  summary: HeatmapSummary;
}

export type MappingFitness = "none" | "weak" | "adequate" | "strong";

export interface DomainMappingSystem {
  id: string;
  name: string;
  category?: string | null;
  vendor?: string | null;
  status?: ObjectStatus | null;
  hosting_model?: string | null;
}

export interface DomainCapabilityMapping {
  capability_id: string;
  system_id: string;
  relationship_id: string;
  fitness: MappingFitness;
}

export interface DomainMappingStats {
  capability_count: number;
  mapped_system_count: number;
  strong_count: number;
  adequate_count: number;
  weak_count: number;
  gap_count: number;
}

export interface DomainDetail {
  id: string;
  name: string;
  icon?: string | null;
  owner?: string | null;
  description?: string | null;
  source_template_id?: string | null;
  capabilities: CapabilityMapCapability[];
  systems: DomainMappingSystem[];
  mappings: DomainCapabilityMapping[];
  stats: DomainMappingStats;
}

export interface DomainLinkedCapabilityRef {
  id: string;
  name: string;
}

export interface DomainLinkedProduct {
  id: string;
  name: string;
  lifecycle: string;
  owner?: string | null;
  product_line?: string | null;
  system_count: number;
  linked_capabilities: DomainLinkedCapabilityRef[];
}

export interface DomainProductsResponse {
  items: DomainLinkedProduct[];
}

export interface DomainHistoryEntry {
  id: string;
  actor_name: string;
  action: string;
  detail?: string | null;
  created_at: string;
}

export interface DomainHistoryResponse {
  entries: DomainHistoryEntry[];
}

export interface UpsertDomainMappingRequest {
  capability_id: string;
  system_id: string;
  fitness: MappingFitness;
}

export interface AddDomainMappingSystemRequest {
  system_id: string;
}

export interface CreateDomainMappingSystemRequest {
  name: string;
  category?: string;
  vendor?: string;
  hosting_model?: ApplicationProperties["hosting_model"];
}

export interface AdoptTemplateResponse {
  template_id: string;
  domain_count: number;
  capability_count: number;
}

export interface LibraryDomainSuggestion {
  name: string;
  icon: string;
  template_id: string;
  already_on_map?: boolean;
}

export interface LibraryDomainGroup {
  template_id: string;
  template_name: string;
  template_icon: string;
  domains: LibraryDomainSuggestion[];
}

export interface LibraryCapabilityItem {
  name: string;
  already_in_domain?: boolean;
}

export interface LibraryCapabilityTemplateGroup {
  template_id: string;
  template_name: string;
  template_icon: string;
  capabilities: LibraryCapabilityItem[];
}

export interface ReusableCapabilitySuggestion {
  name: string;
  from_domain: string;
}

export interface CapabilityPickerSuggestions {
  reusable: ReusableCapabilitySuggestion[];
  template_groups: LibraryCapabilityTemplateGroup[];
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AiInsight {
  id: string;
  type: "gap" | "risk" | "recommendation";
  title: string;
  description: string;
  severity?: "low" | "medium" | "high" | null;
  examples?: string[];
  impact_note?: string;
  affected_object_ids: string[];
  created_at: string;
}

export interface AiInsightsResponse {
  insights: AiInsight[];
  analysed_at: string | null;
  count: number;
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

// ─── People Layer ────────────────────────────────────────────────────────────

export type PeopleRoleKind = "owner" | "performer" | "steward";
export type AssignmentKind = "owner" | "performer";
export type AccountabilityEntityKind =
  | "product"
  | "capability"
  | "business_domain"
  | "process"
  | "application"
  | "data_domain"
  | "data_store";
export type AccountabilityLinkKind =
  | "owns"
  | "performs"
  | "approves"
  | "informed"
  | "stewards"
  | "manages";

export interface PeopleRole {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  role_kind: PeopleRoleKind | string;
  description?: string | null;
  team_count: number;
  created_at: string;
  updated_at: string;
}

export interface PeopleRoleCreate {
  name: string;
  role_kind?: PeopleRoleKind | string;
  description?: string;
}

export interface PeopleRoleUpdate {
  name?: string;
  role_kind?: PeopleRoleKind | string;
  description?: string | null;
}

export interface TeamUsingRole {
  team_id: string;
  team_name: string;
  assignee_name?: string | null;
  assignee_email?: string | null;
  assignment_kind: AssignmentKind | string;
}

export interface TeamRoleOnTeam {
  id: string;
  people_role_id: string;
  role_name: string;
  role_kind: PeopleRoleKind | string;
  assignee_name?: string | null;
  assignee_email?: string | null;
  assignment_kind: AssignmentKind | string;
}

export interface PeopleAccountability {
  id: string;
  entity_kind: AccountabilityEntityKind | string;
  entity_id: string;
  entity_name: string;
  link_kind: AccountabilityLinkKind | string;
  subtitle?: string | null;
}

export interface PeopleRoleDetail extends PeopleRole {
  teams: TeamUsingRole[];
  accountabilities: PeopleAccountability[];
}

export interface PeopleRoleListResponse {
  items: PeopleRole[];
  total: number;
}

export interface Team {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  description?: string | null;
  lead_name?: string | null;
  lead_email?: string | null;
  role_count: number;
  created_at: string;
  updated_at: string;
}

export interface TeamCreate {
  name: string;
  description?: string;
  lead_name?: string;
  lead_email?: string;
}

export interface TeamUpdate {
  name?: string;
  description?: string | null;
  lead_name?: string | null;
  lead_email?: string | null;
}

export interface TeamDetail extends Team {
  roles: TeamRoleOnTeam[];
  accountabilities: PeopleAccountability[];
}

export interface TeamListResponse {
  items: Team[];
  total: number;
}

export interface TeamRoleAssignmentCreate {
  people_role_id: string;
  assignee_name?: string;
  assignee_email?: string;
  assignment_kind?: AssignmentKind | string;
}

export interface TeamRoleAssignmentUpdate {
  assignee_name?: string | null;
  assignee_email?: string | null;
  assignment_kind?: AssignmentKind | string;
}

export interface AddRoleToTeamCreate {
  team_id: string;
  assignee_name?: string;
  assignee_email?: string;
  assignment_kind?: AssignmentKind | string;
}

export interface AccountabilityCreate {
  entity_kind: AccountabilityEntityKind | string;
  entity_id: string;
  link_kind: AccountabilityLinkKind | string;
}

export interface AccountabilityUpdate {
  link_kind: AccountabilityLinkKind | string;
}

// ─── Data Layer ──────────────────────────────────────────────────────────────

export interface DataLink {
  id: string;
  entity_kind: string;
  entity_id: string;
  entity_name: string;
  link_kind: string;
  role_tag?: string | null;
  subtitle?: string | null;
}

export interface DataLinkCreate {
  entity_kind: string;
  entity_id: string;
  link_kind: string;
  role_tag?: string | null;
}

export interface DataObjectDetail {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  description?: string | null;
  classification?: string | null;
  sensitivity?: string | null;
  data_domain_id?: string | null;
  data_domain_name?: string | null;
  related_entities: DataLink[];
  links: DataLink[];
  inferred_capabilities: DataLink[];
  inferred_processes: DataLink[];
  created_at: string;
  updated_at: string;
}

export interface DataObjectCreate {
  name: string;
  description?: string;
  classification?: string;
  sensitivity?: string;
}

export interface DataObjectUpdate {
  name?: string;
  description?: string | null;
  classification?: string | null;
  sensitivity?: string | null;
  data_domain_id?: string | null;
}

export interface DataStoreDetail {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  description?: string | null;
  store_type?: string | null;
  technology?: string | null;
  health?: string | null;
  data_domain_id?: string | null;
  data_domain_name?: string | null;
  links: DataLink[];
  created_at: string;
  updated_at: string;
}

export interface DataStoreCreate {
  name: string;
  description?: string;
  store_type?: string;
  technology?: string;
  health?: string;
}

export interface DataStoreUpdate {
  name?: string;
  description?: string | null;
  store_type?: string | null;
  technology?: string | null;
  health?: string | null;
  data_domain_id?: string | null;
}

export interface DataDomainDetail {
  id: string;
  workspace_id: string;
  org_id: string;
  name: string;
  description?: string | null;
  classification?: string | null;
  owning_team?: string | null;
  steward_name?: string | null;
  steward_email?: string | null;
  capability_domain_id?: string | null;
  capability_domain_name?: string | null;
  links: DataLink[];
  inferred_summary: string[];
  created_at: string;
  updated_at: string;
}

export interface DataDomainCreate {
  name: string;
  description?: string;
  classification?: string;
  owning_team?: string;
  steward_name?: string;
  steward_email?: string;
}

export interface DataDomainUpdate {
  name?: string;
  description?: string | null;
  classification?: string | null;
  owning_team?: string | null;
  steward_name?: string | null;
  steward_email?: string | null;
  capability_domain_id?: string | null;
}
