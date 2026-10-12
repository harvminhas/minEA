import { AI_FEATURE_CATALOG, type AiCatalogEntry, type AiFeature } from "@minea/types";
import { catalogEntriesFor } from "@/lib/ai/catalog";

type PickerHost = { type: string; name: string; status?: string | null; properties?: Record<string, unknown> | null };

export const FEATURE_PICKER_HELPER = 'Type the name of the AI feature, e.g. "Smart replies"';
export const customOptionLabel = (typed: string) => `+ Add "${typed.trim()}" as an AI feature`;

export type FeaturePickerView = {
  /** Heading for the host's own features, e.g. "From Zoom"; null when there are none. */
  ownHeading: string | null;
  own: AiCatalogEntry[];
  others: AiCatalogEntry[];
  /** The typed text to add as a custom feature, when nothing matches it exactly. */
  custom: string | null;
  helper: boolean;
};

const low = (value: string) => value.trim().toLowerCase();

function hostVendor(host: PickerHost, own: AiCatalogEntry[]): string {
  const vendor = host.properties?.vendor;
  if (typeof vendor === "string" && vendor.trim()) return vendor.trim();
  return own[0]?.vendor ?? "";
}

/** The "+ Add an AI feature" picker: this app's vendor first, then the rest, then a custom add for unmatched text. */
export function featurePicker(host: PickerHost, stored: readonly AiFeature[], query: string, limit = 8): FeaturePickerView {
  const taken = new Set(stored.map((item) => item.key));
  const forHost = catalogEntriesFor(host);
  const forKeys = new Set(forHost.map((entry) => entry.key));
  const vendor = hostVendor(host, forHost);
  const isOwn = (entry: AiCatalogEntry) => forKeys.has(entry.key) || (vendor !== "" && low(entry.vendor) === low(vendor));
  const term = low(query);
  const matches = AI_FEATURE_CATALOG.filter((entry) => !taken.has(entry.key)).filter((entry) => !term || `${entry.name} ${entry.vendor}`.toLowerCase().includes(term));
  const own = matches.filter(isOwn).sort((a, b) => Number(forKeys.has(b.key)) - Number(forKeys.has(a.key)));
  const others = matches.filter((entry) => !isOwn(entry)).slice(0, Math.max(0, limit - own.length));
  const exact = term !== "" && (AI_FEATURE_CATALOG.some((entry) => low(entry.name) === term) || stored.some((item) => low(item.name) === term));
  const ownLabel = vendor || host.name;
  return {
    ownHeading: own.length ? `From ${ownLabel}` : null,
    own,
    others,
    custom: term && !exact ? query.trim() : null,
    helper: !term && forHost.length === 0,
  };
}
