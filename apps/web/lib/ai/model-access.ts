import type { MinEAObject } from "@minea/types";
import { uiTypeLabel } from "@/lib/ui-type-labels";
import { MODEL_ACCESS_PROVIDERS, MODEL_ACCESS_TARGETS, matchingProvider, type ModelAccessProvider, type ModelFamily } from "@/lib/ai/model-families";

const fold = (value: string) => value.trim().toLowerCase();

/** The vendor a picked family fills in, only when the model has no vendor yet (never overwrites). */
export function vendorToFill(family: Pick<ModelFamily, "vendor"> | null, hasVendor: boolean): string | null {
  return family && !hasVendor ? family.vendor : null;
}

type Choice = { id: string; name: string; sub: string };

/** What the Accessed through picker lists for a search: workspace platforms and apps, then common providers. */
export function accessChoices(
  objects: readonly Pick<MinEAObject, "id" | "type" | "name" | "properties">[],
  selfId: string,
  query: string
): { workspace: Choice[]; providers: ModelAccessProvider[]; addLabel: string | null } {
  const needle = fold(query);
  const targets = MODEL_ACCESS_TARGETS as readonly string[];
  const workspace = objects
    .filter((item) => item.id !== selfId && targets.includes(item.type) && (!needle || fold(item.name).includes(needle)))
    .sort((a, b) => Number(b.type === "cloud_service") - Number(a.type === "cloud_service") || a.name.localeCompare(b.name))
    .map((item) => {
      const props = (item.properties ?? {}) as Record<string, unknown>;
      const vendor = typeof props.vendor === "string" ? props.vendor : "";
      const kind = item.type === "cloud_service" && props.platform_type === "ai_platform" ? "AI platform" : uiTypeLabel(item.type, true);
      return { id: item.id, name: item.name, sub: [kind.charAt(0).toUpperCase() + kind.slice(1), vendor].filter(Boolean).join(" · ") };
    });
  // A provider already in the workspace shows once, under the workspace.
  const providers = MODEL_ACCESS_PROVIDERS.filter(
    (provider) =>
      !matchingProvider(objects, provider, targets) &&
      (!needle || [provider.name, provider.vendor ?? "", ...provider.aliases].some((name) => fold(name).includes(needle)))
  );
  const typed = query.trim();
  const taken = [...workspace.map((item) => item.name), ...providers.map((provider) => provider.name)].some((name) => fold(name) === needle);
  return { workspace, providers, addLabel: typed && !taken ? typed : null };
}

