/**
 * UI vocabulary — code uses precise names; labels here are user-facing.
 * Org-level overrides can replace these later (spec §5.3).
 */
export const labels = {
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
  journey: "Customer journey",
  moment: "Journey moment",
  investment: "Investment",
  view: "View",
  repository: "Repository",
} as const;

export const glossary = [
  {
    term: labels.capability,
    definition: "Something the business does. Stable. (e.g. Verify identity.)",
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
