/**
 * UI vocabulary — code uses precise names; labels here are user-facing.
 * Org-level overrides can replace these later (spec §5.3).
 */
export const labels = {
  domain: "Domain",
  capability: "Capability",
  businessCapability: "Business capability",
  technicalCapability: "Platform capability",
  realization: "Realization",
  system: "System",
  application: "Application",
  product: "Product",
  process: "Process",
  valueStream: "Value stream",
  stage: "Stage",
  journey: "Journey",
  moment: "Journey step",
  investment: "Investment",
  view: "View",
  repository: "Repository",
} as const;

export const glossary = [
  {
    term: labels.domain,
    definition:
      "A level-1 grouping in the capability map (e.g. Customer, Finance). Capabilities always belong to exactly one domain.",
  },
  {
    term: labels.capability,
    definition: "A level-2 thing the business does, scoped to a domain. Duplicate names across domains when needed.",
  },
  {
    term: labels.realization,
    definition:
      "How that capability is done today — manual, partial, automated, or outsourced.",
  },
  {
    term: labels.system,
    definition: "Software that supports realizations.",
  },
  {
    term: labels.product,
    definition: "Something the business offers, defined by the capabilities it delivers.",
  },
  {
    term: labels.process,
    definition:
      "An end-to-end operational flow with stages and cycle time. (Some orgs call these value streams.)",
  },
  {
    term: labels.journey,
    definition: "A customer's experience, made of moments. Distinct from a process.",
  },
  {
    term: labels.investment,
    definition: "A proposed change to a realization, with expected impact.",
  },
  {
    term: labels.view,
    definition: "A lens over the repository. Views never own data — they project it.",
  },
] as const;
