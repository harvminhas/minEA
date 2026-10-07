import { agentChain, aiLandscape, type LandscapeEdge, type LandscapeObject } from "./landscape";

/** The stable projection the fixture's `expected` block pins down. */
export function summarize(input: { objects: LandscapeObject[]; relationships: LandscapeEdge[] }) {
  const result = aiLandscape(input);
  return {
    places: result.places,
    flags: result.flags.length,
    highFlags: result.highFlags,
    spend: result.spend,
    features: result.features.map((item) => item.id),
    offFeatures: result.offFeatures.map((item) => item.id),
    agents: result.agents.map((item) => ({ id: item.id, active: item.active, owner: item.owner, identityGap: item.identityGap })),
    platforms: result.platforms.map((item) => ({ id: item.id, kind: item.kindLabel, counted: item.counted, cost: item.cost, usedBy: item.usedBy.map((use) => use.id) })),
    unreviewed: result.unreviewed.map((item) => `${item.hostId}:${item.entry.key}`),
    flagList: result.flags.map((flag) => ({ id: flag.id, severity: flag.severity, itemIds: flag.itemIds, why: flag.why })),
    chainAgentId: result.chainAgentId,
    chain: result.chainAgentId ? agentChain(result.chainAgentId, input.objects, input.relationships).map((step) => `${step.verb} ${step.targetName} (${step.lane ?? "identity"})`) : [],
  };
}
