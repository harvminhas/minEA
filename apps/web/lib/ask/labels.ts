/**
 * One vendor identity and plain labels (mirrors apps/api/app/ai/ask/labels.py; data in ask-labels.json,
 * parity-tested). Stored form codes ("salesforce_mulesoft", "microsoft", "other") and aliases resolve to
 * one display vendor; a product is kept apart; snake_case leftovers are humanized, never shown raw.
 */
import data from "./ask-labels.json";
import { TOOL_CATALOG } from "@/lib/catalog/tools-catalog";

type Code = { vendor: string; product?: string } | null;
const CODES = data.vendor_codes as Record<string, Code>;
const ALIASES = data.vendor_aliases as Record<string, string>;
const NOT_VENDOR = new Set<string>(data.not_vendor);
const HOSTING = data.hosting as Record<string, string>;
const LABELS = data.codes as Record<string, string>;
const CODE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

let catalogueNames: Map<string, string> | null = null;
function catalogueVendor(key: string): string | undefined {
  if (!catalogueNames) {
    catalogueNames = new Map();
    for (const tool of TOOL_CATALOG as { vendor?: string }[]) {
      const vendor = (tool.vendor ?? "").trim();
      if (vendor && !catalogueNames.has(vendor.toLowerCase())) catalogueNames.set(vendor.toLowerCase(), vendor);
    }
  }
  return catalogueNames.get(key);
}

const keyOf = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function humanize(value: string): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  const known = LABELS[text] ?? HOSTING[text];
  if (known) return known;
  if (CODE.test(text)) {
    const words = text.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return text;
}

export function resolveVendor(raw: unknown): { vendor: string | null; product: string | null } {
  const text = String(raw ?? "").trim();
  if (!text) return { vendor: null, product: null };
  const key = keyOf(text);
  if (key in CODES) {
    const entry = CODES[key];
    return entry ? { vendor: entry.vendor, product: entry.product ?? null } : { vendor: null, product: null };
  }
  if (NOT_VENDOR.has(key)) return { vendor: null, product: null };
  if (ALIASES[key]) return { vendor: ALIASES[key], product: null };
  return { vendor: catalogueVendor(key) ?? humanize(text), product: null };
}

/** Identity for exact vendor matching: the resolved display name, folded. */
export function vendorKey(value: string): string {
  return (resolveVendor(value).vendor ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
