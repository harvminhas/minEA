import { TOOL_CATALOG } from "@/lib/catalog/tools-catalog";
import { dedupeKey } from "@/lib/setup/add-plan";

export const ADD_BOX_LABEL = "Add applications: type the names, separated by commas or new lines";
export const ADD_BOX_BUTTON = "Add apps";

/** Everyday products first; the rest of the catalog (EDI, label printing...) follows in catalog order. */
const COMMON_FIRST = ["Slack", "Zoom Workplace", "Google Workspace", "Microsoft 365", "HubSpot", "Dropbox", "QuickBooks Online", "Salesforce", "Okta", "Shopify"];

/** Common catalog products of this kind the workspace doesn't have yet, in catalog order. */
export function quickAddSuggestions(kind: "app" | "platform", existingNames: string[], limit = 5): string[] {
  const have = new Set(existingNames.map(dedupeKey).filter(Boolean));
  const out: string[] = [];
  const rank = (name: string) => { const i = COMMON_FIRST.indexOf(name); return i < 0 ? COMMON_FIRST.length : i; };
  const ordered = [...TOOL_CATALOG].sort((a, b) => rank(a.name) - rank(b.name));
  for (const tool of ordered) {
    if (tool.kind !== kind) continue;
    const keys = [tool.name, ...tool.aliases].map(dedupeKey);
    if (keys.some((key) => have.has(key))) continue;
    if (out.some((name) => dedupeKey(name) === dedupeKey(tool.name))) continue;
    out.push(tool.name);
    if (out.length >= limit) break;
  }
  return out;
}

/** Ctrl/Cmd+Enter submits; plain Enter stays a new line, since new lines separate names. */
export function isSubmitKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; nativeEvent?: { isComposing?: boolean } }): boolean {
  return event.key === "Enter" && Boolean(event.ctrlKey || event.metaKey) && !event.nativeEvent?.isComposing;
}

export function canSubmitAdd(text: string, saved: boolean): boolean {
  return text.trim().length > 0 && !saved;
}
