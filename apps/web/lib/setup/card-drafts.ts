import { normalizeTerm, type HostingChoice } from "@/lib/setup/match-tools";

type CardObject = { id: string; name: string; type: string; properties?: Record<string, unknown> | null };
type DraftLike = { input: string; tool: { name: string } | null; objectId?: string; choice: HostingChoice; status?: string };

/** The card's "Where does it live?" pick, read back from the saved object's hosting_model. */
export function choiceFromHosting(model: unknown): HostingChoice {
  if (model === "saas" || model === "paas" || model === "self_hosted") return "saas";
  if (model === "own_cloud") return "own_cloud";
  if (model === "on_premise") return "own";
  if (model === "desktop") return "desktop";
  return "unknown";
}

/**
 * Setup wizard: after the shared add panel saved the cards, tie each typed line to the object now in
 * the catalogue (by the matched tool name or the typed name) so the later steps (AI, where, owners)
 * open prefilled and never create the same app twice. Objects created by that save are preferred.
 */
export function draftsFromCards<T extends DraftLike>(drafts: T[], objects: CardObject[], createdIds: string[] = []): T[] {
  const fresh = new Set(createdIds);
  const ordered = [...objects].sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)));
  return drafts.map((draft) => {
    const names = new Set([draft.input, draft.tool?.name].filter((name): name is string => Boolean(name)).map(normalizeTerm));
    const hit = ordered.find((object) => (object.type === "application" || object.type === "model") && names.has(normalizeTerm(object.name)));
    if (!hit) return draft;
    const choice = choiceFromHosting(hit.properties?.hosting_model);
    const resolved = { ...draft, objectId: hit.id, choice: choice === "unknown" ? draft.choice : choice };
    // The card answered "Did you mean": the saved name says which way.
    if (draft.status === "weak" || draft.status === "pick") {
      if (draft.tool && normalizeTerm(hit.name) === normalizeTerm(draft.tool.name)) return { ...resolved, status: "matched" };
      if (normalizeTerm(hit.name) === normalizeTerm(draft.input)) return { ...resolved, status: "custom", tool: null };
    }
    return resolved;
  });
}
