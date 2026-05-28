import type {
  ComponentProperties,
  ComponentRuntimeRef,
  ComponentSystemRef,
  MinEAObject,
  ObjectStatus,
} from "@minea/types";

export const APPLICATION_LAYER_COLOR = "#6366f1";

export const COMPONENT_TYPES = [
  { value: "microservice", label: "Microservice" },
  { value: "library", label: "Library" },
  { value: "module", label: "Module" },
  { value: "batch_job", label: "Batch job" },
  { value: "ui_module", label: "UI module" },
  { value: "monolith_part", label: "Monolith part" },
];

export const COMPONENT_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "retiring", label: "Retiring" },
  { value: "retired", label: "Retired" },
];

export const COMPONENT_TYPE_LABEL = Object.fromEntries(
  COMPONENT_TYPES.map((t) => [t.value, t.label])
);

export function buildComponentDraft(params: {
  name: string;
  componentType: string;
  techStack: string;
  systems: ComponentSystemRef[];
  runtime: ComponentRuntimeRef | null;
  status: ObjectStatus;
  owner?: string;
  tags?: string[];
  nodeLayout?: Record<string, { x: number; y: number }>;
}): MinEAObject {
  const properties: ComponentProperties = {
    component_type: params.componentType || undefined,
    tech_stack: params.techStack.trim() || undefined,
    systems: params.systems,
    runtime: params.runtime,
    node_layout: params.nodeLayout,
  };

  return {
    id: "draft",
    workspace_id: "",
    org_id: "",
    type: "component",
    name: params.name.trim() || "New component",
    description: undefined,
    owner: params.owner,
    status: params.status,
    tags: params.tags ?? [],
    properties: properties as Record<string, unknown>,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
