// ─── Object Types ────────────────────────────────────────────────────────────

export type ObjectType =
  // Business Layer
  | "business_domain"
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
  | "data_domain"
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

export type Layer = "strategy" | "business" | "application" | "data" | "integration" | "infrastructure";

export const LAYER_CONFIG: Record<Layer, {
  label: string;
  color: string;
  types: ObjectType[];
}> = {
  strategy: {
    label: "Strategy",
    color: "violet",
    types: ["business_domain", "capability", "value_stream"],
  },
  business: {
    label: "Business",
    color: "blue",
    types: [],
  },
  application: {
    label: "Application",
    color: "indigo",
    types: ["application", "solution", "technical_capability", "agent"],
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
  application: "Application",
  solution: "Solution",
  technical_capability: "Technical Capability",
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

export interface CapabilityMapCapability {
  id: string;
  name: string;
  domain_id: string;
  order_index?: number | null;
  maturity?: number | null;
  investment?: string | null;
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

// ─── People Layer ────────────────────────────────────────────────────────────

export type PeopleRoleKind = "owner" | "performer" | "steward";
export type AssignmentKind = "owner" | "performer";
export type AccountabilityEntityKind =
  | "product"
  | "capability"
  | "business_domain"
  | "process"
  | "application";
export type AccountabilityLinkKind = "owns" | "performs" | "stewards";

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
