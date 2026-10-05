export { ALLOWED_TRIPLES as ALLOWED_TRIPLES_FRONTEND } from "@minea/types";

/** Canonical direction only — do not offer inverse in the relationship picker. */
export const OUTBOUND_ONLY_TRIPLES = new Set(["belongs_to:application:data_domain"]);

export function tripleKey(type: string, from: string, to: string): string {
  return `${type}:${from}:${to}`;
}
