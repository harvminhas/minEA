/** Plain names for record kinds, as the sidebar and pickers say them (no stored codes). */
export const UI_TYPE_LABEL = {
  application: "Applications",
  solution: "Applications",
  technical_capability: "Applications",
  agent: "AI agents",
  ai_model: "AI models",
  cloud_service: "Platforms & cloud",
  model: "Servers & devices",
  location: "Locations",
  external_party: "Vendors & contracts",
  integration_flow: "Flows",
  api: "APIs",
  event: "Events",
  tool: "Integration infra",
  capability: "Capabilities",
  roadmap_item: "Roadmaps",
  data_store: "Data stores",
  data_object: "Data entities",
  data_domain: "Data domains",
  process: "Processes",
  component: "Components",
  tech_debt: "Tech debt",
} as const;

const UI_TYPE_SINGULAR: Record<keyof typeof UI_TYPE_LABEL, string> = {
  application: "Application",
  solution: "Application",
  technical_capability: "Application",
  agent: "AI agent",
  ai_model: "AI model",
  cloud_service: "Platform",
  model: "Server",
  location: "Location",
  external_party: "Vendor",
  integration_flow: "Flow",
  api: "API",
  event: "Event",
  tool: "Integration infra",
  capability: "Capability",
  roadmap_item: "Roadmap",
  data_store: "Data store",
  data_object: "Data entity",
  data_domain: "Data domain",
  process: "Process",
  component: "Component",
  tech_debt: "Tech debt",
};

export function uiTypeLabel(type: string, singular = false): string {
  const key = type as keyof typeof UI_TYPE_LABEL;
  if (singular) return UI_TYPE_SINGULAR[key] ?? UI_TYPE_LABEL[key] ?? type.replaceAll("_", " ");
  return UI_TYPE_LABEL[key] ?? type.replaceAll("_", " ");
}
