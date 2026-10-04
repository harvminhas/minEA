import { AI_ROLES } from "@/lib/ai-role-utils";
import { API_AUDIENCES, API_AUTH, API_CRITICALITY, API_STATUSES, API_STYLES } from "@/lib/api-utils";
import { COMPONENT_STATUSES, COMPONENT_TYPES } from "@/lib/component-utils";
import { EVENT_AUDIENCES, EVENT_CRITICALITY, EVENT_DELIVERY, EVENT_STATUSES } from "@/lib/event-utils";
import { FLOW_FREQUENCIES, FLOW_MANUAL_TRIGGERS, FLOW_MECHANISMS } from "@/lib/flow-utils";
import { infraConfig } from "@/lib/infra/infraConfig";
import { locationTypes } from "@/lib/infra/locations";
import { INFRA_HOSTING, INFRA_KINDS, INFRA_LICENSE, INFRA_VENDORS } from "@/lib/integration-infra-utils";
import {
  PLATFORM_CRITICALITY,
  PLATFORM_HOSTING,
  PLATFORM_LICENSE,
  PLATFORM_LIFECYCLE,
  PLATFORM_SLA,
  PLATFORM_TYPES,
  PLATFORM_VENDORS,
} from "@/lib/platform-utils";
import { RUNTIME_COST_MODEL, RUNTIME_HOSTING, RUNTIME_KINDS, RUNTIME_PROVIDERS } from "@/lib/runtime-utils";
import { systemCategorySelectOptions } from "@/lib/system-category";
import { systemGovernanceSelectOptions } from "@/lib/system-governance";

export type Section = "basics" | "ownership" | "cost" | "hosting" | "lifecycle" | "notes";

export const SECTION_LABEL = {
  basics: "Basics",
  ownership: "Ownership",
  cost: "Cost & contract",
  hosting: "Hosting & location",
  lifecycle: "Lifecycle & risk",
  notes: "Notes",
} as const;

export type Editor =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "select"
  | "tags"
  | "owner"
  | "relation"
  | "costLines"
  | "custom"
  | "none";

export type Source =
  | { kind: "column"; column: "name" | "description" | "status" | "tags" }
  | { kind: "prop"; key: string }
  | { kind: "owner" }
  | { kind: "rel"; edge: string; dir: "out" | "in"; target: string[]; single: boolean }
  | { kind: "people"; field: string }
  | { kind: "derived" };

export type FieldDef = {
  key: string;
  label: string;
  section: Section;
  editor: Editor;
  source: Source;
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  showIf?: (o: { properties: Record<string, unknown>; type: string }) => boolean;
  readOnlyReason?: string;
  table?: boolean;
};

export type RecordType =
  | "application"
  | "server"
  | "platform"
  | "location"
  | "component"
  | "flow"
  | "api"
  | "event"
  | "integration_infra"
  | "team"
  | "role"
  | "contact"
  | "capability";

/** Keys written beside a field, or only by a create form. Not a second editor. */
export const INTERNAL_KEYS = [
  "console_url",
  "node_layout",
  "nodeLayout",
  "sources",
  "destinations",
  "platform",
  "runtime",
  "carrier",
  "annual_cost", // legacy, API writes it back from cost_lines
] as const;

export const SYSTEM_LIFECYCLE_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "retiring", label: "Retiring" },
  { value: "retired", label: "End of life" },
] as const;

export const APPLICATION_HOSTING_OPTIONS = [
  { value: "cloud", label: "Cloud" },
  { value: "on_premise", label: "On-premises" },
  { value: "hybrid", label: "Hybrid" },
  { value: "saas", label: "SaaS" },
] as const;

export const OBJECT_FORM_FLOW_DIRECTION = [
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "bidirectional", label: "Bidirectional" },
] as const;

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const CRITICALITY = PLATFORM_CRITICALITY.map((item) => ({
  value: item.value,
  label: item.value === "tier1" ? "Critical" : item.label,
}));

const FLOW_CRITICALITY_OPTIONS = [
  ...API_CRITICALITY.map((item) => ({ value: item.value, label: item.value === "critical" ? "Critical" : item.label })),
];

function byKey(items: readonly { key: string; label: string }[]) {
  return items.map((item) => ({ value: item.key, label: item.label }));
}

function byValue(items: readonly { value: string; label: string }[]) {
  return items.map((item) => ({ value: item.value, label: item.label }));
}

const appOnly = (o: { type: string }) => o.type === "application";
const platformOther = (o: { properties: Record<string, unknown> }) => o.properties.platform_type === "other";
const infraCustom = (o: { properties: Record<string, unknown> }) => o.properties.integration_infra_kind === "custom";
const flowManual = (o: { properties: Record<string, unknown> }) => o.properties.mechanism === "manual";
const flowSchedule = (o: { properties: Record<string, unknown> }) =>
  o.properties.mechanism === "batch_scheduled" || o.properties.mechanism === "file_based";
const flowPlatform = (o: { properties: Record<string, unknown> }) => o.properties.mechanism === "no_code_ipaas";

const nameCol = (required = true): FieldDef => ({
  key: "name",
  label: "Name",
  section: "basics",
  editor: "text",
  source: { kind: "column", column: "name" },
  required,
});

const peopleName = (label: string): FieldDef => ({
  key: "name",
  label,
  section: "basics",
  editor: "text",
  source: { kind: "people", field: "name" },
  required: true,
});

const tagsCol: FieldDef = {
  key: "tags",
  label: "Tags",
  section: "basics",
  editor: "tags",
  source: { kind: "column", column: "tags" },
};

const descriptionCol: FieldDef = {
  key: "description",
  label: "Description",
  section: "notes",
  editor: "longtext",
  source: { kind: "column", column: "description" },
};

const ownerField = (required = false): FieldDef => ({
  key: "owner",
  label: "Owner",
  section: "ownership",
  editor: "owner",
  source: { kind: "owner" },
  required,
});

export const REGISTRY: Record<RecordType, FieldDef[]> = {
  application: [
    nameCol(true),
    { key: "category", label: "Category", section: "basics", editor: "select", source: { kind: "prop", key: "category" }, options: systemCategorySelectOptions() },
    { key: "is_custom_built", label: "Custom-built", section: "basics", editor: "select", source: { kind: "prop", key: "is_custom_built" }, options: YES_NO },
    { key: "governance_status", label: "Governance status", section: "basics", editor: "select", source: { kind: "prop", key: "governance_status" }, options: systemGovernanceSelectOptions(), required: true },
    { key: "discovery", label: "Discovery", section: "basics", editor: "text", source: { kind: "prop", key: "discovery" } },
    { key: "ai_role", label: "AI role", section: "basics", editor: "select", source: { kind: "prop", key: "ai_role" }, options: AI_ROLES.map((item) => ({ value: item.value, label: item.label })) },
    {
      key: "capabilities",
      label: "Capabilities",
      section: "basics",
      editor: "relation",
      source: { kind: "rel", edge: "supported_by", dir: "in", target: ["capability"], single: false },
      showIf: appOnly,
    },
    tagsCol,
    ownerField(true),
    { key: "vendor", label: "Vendor", section: "cost", editor: "text", source: { kind: "prop", key: "vendor" } },
    { key: "cost", label: "Annual cost", section: "cost", editor: "costLines", source: { kind: "prop", key: "cost_lines" } },
    { key: "contract_renewal", label: "Renewal", section: "cost", editor: "date", source: { kind: "prop", key: "contract_renewal" } },
    { key: "hosting_model", label: "Hosting model", section: "hosting", editor: "select", source: { kind: "prop", key: "hosting_model" }, options: APPLICATION_HOSTING_OPTIONS },
    {
      key: "built_on",
      label: "Built on platform",
      section: "hosting",
      editor: "relation",
      source: { kind: "rel", edge: "built_on", dir: "out", target: ["cloud_service"], single: true },
      showIf: appOnly,
    },
    {
      key: "runs_on",
      label: "Runs on",
      section: "hosting",
      editor: "relation",
      source: { kind: "rel", edge: "runs_on", dir: "out", target: ["model"], single: false },
    },
    { key: "status", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "column", column: "status" }, options: SYSTEM_LIFECYCLE_OPTIONS },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: CRITICALITY },
    { key: "sla_target", label: "SLA target", section: "lifecycle", editor: "select", source: { kind: "prop", key: "sla_target" }, options: byValue(PLATFORM_SLA) },
    descriptionCol,
  ],
  server: [
    { ...nameCol(), label: "Name" },
    { key: "runtime_kind", label: "Kind", section: "basics", editor: "select", source: { kind: "prop", key: "runtime_kind" }, options: byKey(infraConfig.runtimeKinds), table: true },
    { key: "compute_runtime_kind", label: "Compute type", section: "basics", editor: "select", source: { kind: "prop", key: "compute_runtime_kind" }, options: byValue(RUNTIME_KINDS) },
    { key: "service_product", label: "Service / product", section: "basics", editor: "text", source: { kind: "prop", key: "service_product" } },
    { key: "os_name", label: "OS name", section: "basics", editor: "text", source: { kind: "prop", key: "os_name" }, table: true },
    { key: "os_version", label: "OS version", section: "basics", editor: "text", source: { kind: "prop", key: "os_version" }, table: true },
    tagsCol,
    ownerField(true),
    { key: "vendor", label: "Vendor", section: "cost", editor: "text", source: { kind: "prop", key: "vendor" } },
    { key: "runtime_provider", label: "Provider", section: "cost", editor: "select", source: { kind: "prop", key: "runtime_provider" }, options: byValue(RUNTIME_PROVIDERS) },
    { key: "cost", label: "Annual cost", section: "cost", editor: "costLines", source: { kind: "prop", key: "cost_lines" } },
    { key: "cost_model", label: "Cost model", section: "cost", editor: "select", source: { kind: "prop", key: "cost_model" }, options: byValue(RUNTIME_COST_MODEL) },
    { key: "commitment_ends", label: "Renewal", section: "cost", editor: "date", source: { kind: "prop", key: "commitment_ends" }, table: true },
    { key: "notice_period", label: "Notice period", section: "cost", editor: "text", source: { kind: "prop", key: "notice_period" } },
    {
      key: "located_at",
      label: "Location",
      section: "hosting",
      editor: "relation",
      source: { kind: "rel", edge: "located_at", dir: "out", target: ["location"], single: true },
    },
    { key: "location", label: "Location type", section: "hosting", editor: "select", source: { kind: "prop", key: "location" }, options: byKey(infraConfig.locations), table: true },
    { key: "region", label: "Region / site", section: "hosting", editor: "text", source: { kind: "prop", key: "region" } },
    { key: "hosting_model", label: "Hosting model", section: "hosting", editor: "select", source: { kind: "prop", key: "hosting_model" }, options: byValue(RUNTIME_HOSTING) },
    { key: "environments", label: "Environments", section: "hosting", editor: "tags", source: { kind: "prop", key: "environments" } },
    { key: "access_method", label: "Access method", section: "hosting", editor: "text", source: { kind: "prop", key: "access_method" } },
    {
      key: "runs_on",
      label: "Runs on",
      section: "hosting",
      editor: "relation",
      source: { kind: "rel", edge: "runs_on", dir: "out", target: ["model"], single: true },
    },
    { key: "runs_on_it", label: "Runs on it", section: "hosting", editor: "none", source: { kind: "derived" }, readOnlyReason: "Count of items linked to run here" },
    { key: "support_ends", label: "Support ends", section: "lifecycle", editor: "date", source: { kind: "prop", key: "support_ends" }, table: true },
    { key: "end_of_life", label: "End of life", section: "lifecycle", editor: "date", source: { kind: "prop", key: "end_of_life" } },
    { key: "status_calc", label: "Status", section: "lifecycle", editor: "none", source: { kind: "derived" }, readOnlyReason: "Calculated from Support ends and OS" },
    { key: "lifecycle", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "prop", key: "lifecycle" }, options: byValue(PLATFORM_LIFECYCLE) },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: CRITICALITY },
    { key: "sla_target", label: "SLA target", section: "lifecycle", editor: "select", source: { kind: "prop", key: "sla_target" }, options: byValue(PLATFORM_SLA) },
    descriptionCol,
  ],
  platform: [
    nameCol(),
    { key: "platform_kind", label: "Kind", section: "basics", editor: "select", source: { kind: "prop", key: "platform_kind" }, options: byKey(infraConfig.platformKinds), table: true },
    { key: "platform_type", label: "Platform type", section: "basics", editor: "select", source: { kind: "prop", key: "platform_type" }, options: byValue(PLATFORM_TYPES) },
    { key: "platform_type_other", label: "Other type", section: "basics", editor: "text", source: { kind: "prop", key: "platform_type_other" }, showIf: platformOther },
    { key: "vendor_product", label: "Product", section: "basics", editor: "text", source: { kind: "prop", key: "vendor_product" } },
    tagsCol,
    ownerField(true),
    { key: "vendor", label: "Vendor", section: "cost", editor: "text", source: { kind: "prop", key: "vendor" }, options: byValue(PLATFORM_VENDORS), table: true },
    { key: "license_model", label: "License model", section: "cost", editor: "select", source: { kind: "prop", key: "license_model" }, options: byValue(PLATFORM_LICENSE) },
    { key: "cost", label: "Annual cost", section: "cost", editor: "costLines", source: { kind: "prop", key: "cost_lines" } },
    { key: "contract_renewal", label: "Renewal", section: "cost", editor: "date", source: { kind: "prop", key: "contract_renewal" }, table: true },
    { key: "notice_period", label: "Notice period", section: "cost", editor: "text", source: { kind: "prop", key: "notice_period" } },
    { key: "hosting_model", label: "Hosting model", section: "hosting", editor: "select", source: { kind: "prop", key: "hosting_model" }, options: byValue(PLATFORM_HOSTING), table: true },
    { key: "region", label: "Region", section: "hosting", editor: "text", source: { kind: "prop", key: "region" } },
    {
      key: "located_at",
      label: "Location",
      section: "hosting",
      editor: "relation",
      source: { kind: "rel", edge: "located_at", dir: "out", target: ["location"], single: true },
    },
    { key: "environments", label: "Environments", section: "hosting", editor: "tags", source: { kind: "prop", key: "environments" } },
    { key: "admin_url", label: "Admin URL", section: "hosting", editor: "text", source: { kind: "prop", key: "admin_url" } },
    { key: "built_on_it", label: "Built on it", section: "hosting", editor: "none", source: { kind: "derived" }, readOnlyReason: "Count of items built on this" },
    { key: "lifecycle", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "prop", key: "lifecycle" }, options: byValue(PLATFORM_LIFECYCLE) },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: CRITICALITY },
    { key: "sla_target", label: "SLA target", section: "lifecycle", editor: "select", source: { kind: "prop", key: "sla_target" }, options: byValue(PLATFORM_SLA) },
    descriptionCol,
  ],
  location: [
    { ...nameCol(true), label: "Name" },
    { key: "location_type", label: "Type", section: "basics", editor: "select", source: { kind: "prop", key: "location_type" }, options: byKey(locationTypes) },
    { key: "address", label: "Address", section: "basics", editor: "text", source: { kind: "prop", key: "address" } },
    ownerField(),
    { key: "items_there", label: "Items there", section: "hosting", editor: "none", source: { kind: "derived" } },
    { key: "apps_affected", label: "Apps affected", section: "hosting", editor: "none", source: { kind: "derived" } },
  ],
  component: [
    nameCol(true),
    { key: "component_type", label: "Type", section: "basics", editor: "select", source: { kind: "prop", key: "component_type" }, options: byValue(COMPONENT_TYPES), required: true },
    { key: "tech_stack", label: "Tech stack", section: "basics", editor: "text", source: { kind: "prop", key: "tech_stack" } },
    { key: "ai_role", label: "AI role", section: "basics", editor: "select", source: { kind: "prop", key: "ai_role" }, options: AI_ROLES.map((item) => ({ value: item.value, label: item.label })) },
    tagsCol,
    ownerField(true),
    { key: "part_of", label: "Part of systems", section: "hosting", editor: "custom", source: { kind: "prop", key: "systems" }, required: true },
    { key: "runtime", label: "Runs on", section: "hosting", editor: "custom", source: { kind: "prop", key: "runtime" } },
    { key: "platform", label: "Built on platform", section: "hosting", editor: "custom", source: { kind: "prop", key: "platform" } },
    { key: "status", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "column", column: "status" }, options: byValue(COMPONENT_STATUSES) },
  ],
  flow: [
    nameCol(true),
    { key: "from", label: "From", section: "basics", editor: "custom", source: { kind: "prop", key: "from" }, required: true },
    { key: "to", label: "To", section: "basics", editor: "custom", source: { kind: "prop", key: "to" }, required: true },
    { key: "mechanism", label: "Mechanism", section: "basics", editor: "select", source: { kind: "prop", key: "mechanism" }, options: byValue(FLOW_MECHANISMS), required: true },
    { key: "manual_owner", label: "Responsible owner", section: "basics", editor: "text", source: { kind: "prop", key: "manual_owner" }, showIf: flowManual },
    { key: "manual_trigger", label: "Trigger", section: "basics", editor: "select", source: { kind: "prop", key: "manual_trigger" }, options: byValue(FLOW_MANUAL_TRIGGERS), showIf: flowManual },
    { key: "schedule", label: "Schedule", section: "basics", editor: "text", source: { kind: "prop", key: "schedule" }, showIf: flowSchedule },
    { key: "platform", label: "Platform", section: "basics", editor: "text", source: { kind: "prop", key: "platform" }, showIf: flowPlatform },
    { key: "protocol", label: "Protocol", section: "basics", editor: "text", source: { kind: "prop", key: "protocol" } },
    { key: "format", label: "Format", section: "basics", editor: "text", source: { kind: "prop", key: "format" } },
    { key: "frequency", label: "Frequency", section: "basics", editor: "select", source: { kind: "prop", key: "frequency" }, options: byValue(FLOW_FREQUENCIES) },
    { key: "auth", label: "Auth", section: "basics", editor: "text", source: { kind: "prop", key: "auth" } },
    { key: "direction", label: "Direction", section: "basics", editor: "select", source: { kind: "prop", key: "direction" }, options: OBJECT_FORM_FLOW_DIRECTION },
    { key: "data_classification", label: "Classification", section: "basics", editor: "text", source: { kind: "prop", key: "data_classification" } },
    ownerField(),
    { key: "carrier", label: "Integration infrastructure", section: "hosting", editor: "custom", source: { kind: "prop", key: "carrier" } },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: FLOW_CRITICALITY_OPTIONS },
    descriptionCol,
  ],
  api: [
    nameCol(true),
    { key: "protocol", label: "Style", section: "basics", editor: "select", source: { kind: "prop", key: "protocol" }, options: byValue(API_STYLES) },
    { key: "version", label: "Version", section: "basics", editor: "text", source: { kind: "prop", key: "version" } },
    { key: "base_url", label: "Base URL", section: "basics", editor: "text", source: { kind: "prop", key: "base_url" } },
    { key: "auth", label: "Auth", section: "basics", editor: "select", source: { kind: "prop", key: "auth" }, options: byValue(API_AUTH) },
    tagsCol,
    ownerField(true),
    { key: "provider", label: "Provider", section: "hosting", editor: "custom", source: { kind: "prop", key: "provider" }, required: true },
    { key: "consumers", label: "Consumers", section: "hosting", editor: "custom", source: { kind: "prop", key: "consumers" } },
    { key: "gateway", label: "Gateway", section: "hosting", editor: "custom", source: { kind: "prop", key: "gateway" } },
    { key: "status", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "column", column: "status" }, options: byValue(API_STATUSES) },
    { key: "audience", label: "Audience", section: "lifecycle", editor: "select", source: { kind: "prop", key: "audience" }, options: byValue(API_AUDIENCES) },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: FLOW_CRITICALITY_OPTIONS },
    descriptionCol,
  ],
  event: [
    nameCol(true),
    { key: "topic", label: "Topic", section: "basics", editor: "text", source: { kind: "prop", key: "topic" }, required: true },
    { key: "version", label: "Version", section: "basics", editor: "text", source: { kind: "prop", key: "version" } },
    { key: "delivery", label: "Delivery", section: "basics", editor: "select", source: { kind: "prop", key: "delivery" }, options: byValue(EVENT_DELIVERY) },
    { key: "schema_ref", label: "Schema reference", section: "basics", editor: "text", source: { kind: "prop", key: "schema_ref" } },
    tagsCol,
    ownerField(true),
    { key: "producer", label: "Producer", section: "hosting", editor: "custom", source: { kind: "prop", key: "producer" }, required: true },
    { key: "subscribers", label: "Subscribers", section: "hosting", editor: "custom", source: { kind: "prop", key: "subscribers" } },
    { key: "broker", label: "Broker", section: "hosting", editor: "custom", source: { kind: "prop", key: "broker" } },
    { key: "status", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "column", column: "status" }, options: byValue(EVENT_STATUSES) },
    { key: "audience", label: "Audience", section: "lifecycle", editor: "select", source: { kind: "prop", key: "audience" }, options: byValue(EVENT_AUDIENCES) },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: byValue(EVENT_CRITICALITY).map((item) => ({ value: item.value, label: item.value === "critical" ? "Critical" : item.label })) },
    descriptionCol,
  ],
  integration_infra: [
    nameCol(true),
    { key: "integration_infra_kind", label: "Kind", section: "basics", editor: "select", source: { kind: "prop", key: "integration_infra_kind" }, options: byValue(INFRA_KINDS), required: true },
    { key: "integration_infra_kind_other", label: "Custom kind", section: "basics", editor: "text", source: { kind: "prop", key: "integration_infra_kind_other" }, showIf: infraCustom },
    { key: "integration_infra_handles", label: "Handles", section: "basics", editor: "custom", source: { kind: "prop", key: "integration_infra_handles" } },
    { key: "vendor_product", label: "Product", section: "basics", editor: "text", source: { kind: "prop", key: "vendor_product" } },
    tagsCol,
    ownerField(true),
    { key: "vendor", label: "Vendor", section: "cost", editor: "select", source: { kind: "prop", key: "vendor" }, options: byValue(INFRA_VENDORS) },
    { key: "license_model", label: "License model", section: "cost", editor: "select", source: { kind: "prop", key: "license_model" }, options: byValue(INFRA_LICENSE) },
    { key: "cost", label: "Annual cost", section: "cost", editor: "text", source: { kind: "prop", key: "annual_cost" } },
    { key: "contract_renewal", label: "Renewal", section: "cost", editor: "date", source: { kind: "prop", key: "contract_renewal" } },
    { key: "hosting_model", label: "Hosting model", section: "hosting", editor: "select", source: { kind: "prop", key: "hosting_model" }, options: byValue(INFRA_HOSTING) },
    { key: "region", label: "Region", section: "hosting", editor: "text", source: { kind: "prop", key: "region" } },
    { key: "environments", label: "Environments", section: "hosting", editor: "tags", source: { kind: "prop", key: "environments" } },
    { key: "admin_url", label: "Admin URL", section: "hosting", editor: "text", source: { kind: "prop", key: "admin_url" } },
    { key: "auth_mechanism", label: "Auth", section: "hosting", editor: "text", source: { kind: "prop", key: "auth_mechanism" } },
    { key: "lifecycle", label: "Lifecycle", section: "lifecycle", editor: "select", source: { kind: "prop", key: "lifecycle" }, options: byValue(PLATFORM_LIFECYCLE) },
    { key: "criticality", label: "Criticality", section: "lifecycle", editor: "select", source: { kind: "prop", key: "criticality" }, options: CRITICALITY },
    { key: "sla_target", label: "SLA target", section: "lifecycle", editor: "select", source: { kind: "prop", key: "sla_target" }, options: byValue(PLATFORM_SLA) },
    descriptionCol,
  ],
  team: [
    peopleName("Name"),
    { key: "lead", label: "Team lead", section: "basics", editor: "custom", source: { kind: "people", field: "lead" } },
    descriptionCol,
  ],
  role: [
    peopleName("Name"),
    descriptionCol,
    { key: "teams_using", label: "Teams using this role", section: "basics", editor: "none", source: { kind: "derived" }, readOnlyReason: "Assign roles from a team" },
  ],
  contact: [
    peopleName("Name"),
    { key: "email", label: "Email", section: "basics", editor: "text", source: { kind: "people", field: "email" } },
    { key: "team", label: "Team", section: "basics", editor: "select", source: { kind: "people", field: "team_id" } },
  ],
  capability: [
    peopleName("Capability name"),
    ownerField(),
  ],
};

const OBJECT_TYPE: Record<string, RecordType> = {
  application: "application",
  solution: "application",
  technical_capability: "application",
  model: "server",
  cloud_service: "platform",
  tool: "integration_infra",
  integration_flow: "flow",
  location: "location",
  component: "component",
  api: "api",
  event: "event",
  team: "team",
  role: "role",
  contact: "contact",
  capability: "capability",
};

export function recordTypeOf(objectType: string): RecordType | null {
  return OBJECT_TYPE[objectType] ?? null;
}

export type CreateFormType = "application" | "server" | "platform";

/** Fields the application, server, and platform create forms render, in registry order. */
export const CREATE_FORM_KEYS: Record<CreateFormType, readonly string[]> = {
  application: [
    "name",
    "category",
    "is_custom_built",
    "governance_status",
    "discovery",
    "ai_role",
    "capabilities",
    "tags",
    "owner",
    "vendor",
    "cost",
    "contract_renewal",
    "hosting_model",
    "built_on",
    "status",
    "criticality",
    "sla_target",
    "description",
  ],
  server: [
    "name",
    "compute_runtime_kind",
    "service_product",
    "tags",
    "owner",
    "vendor",
    "runtime_provider",
    "cost",
    "cost_model",
    "commitment_ends",
    "region",
    "hosting_model",
    "environments",
    "access_method",
    "lifecycle",
    "criticality",
    "sla_target",
    "description",
  ],
  platform: [
    "name",
    "platform_type",
    "platform_type_other",
    "vendor_product",
    "tags",
    "owner",
    "vendor",
    "license_model",
    "cost",
    "contract_renewal",
    "hosting_model",
    "region",
    "environments",
    "admin_url",
    "lifecycle",
    "criticality",
    "sla_target",
    "description",
  ],
};

/**
 * Create-form starting values. Optional criticality, SLA, vendor, hosting, kind,
 * license model, cost model, and lifecycle stay blank.
 * A required kind and provider keep the preselection the runtime form already used.
 */
export function createFormSeed(type: CreateFormType): Record<string, string> {
  const seed: Record<string, string> = {
    criticality: "",
    sla_target: "",
    vendor: "",
    hosting_model: "",
    kind: "",
    provider: "",
    license_model: "",
    cost_model: "",
    lifecycle: "",
  };
  if (type === "server") {
    seed.kind = "kubernetes";
    seed.provider = "aws";
  }
  return seed;
}

/** Registry fields for a create form, in CREATE_FORM_KEYS order. */
export function createFormFields(type: CreateFormType): FieldDef[] {
  const byKey = new Map(REGISTRY[type].map((field) => [field.key, field]));
  return CREATE_FORM_KEYS[type].map((key) => {
    const field = byKey.get(key);
    if (!field) throw new Error(`${type} create form is missing ${key}`);
    return field;
  });
}

export function groupCreateFields(type: CreateFormType): { section: Section; fields: FieldDef[] }[] {
  const groups: { section: Section; fields: FieldDef[] }[] = [];
  for (const field of createFormFields(type)) {
    const last = groups[groups.length - 1];
    if (last?.section === field.section) last.fields.push(field);
    else groups.push({ section: field.section, fields: [field] });
  }
  return groups;
}

export { fieldIsRequired } from "./save";
