/** Query params the impact view reads; /views with any of them is an old impact link. */
export const IMPACT_PARAMS = ["tab", "sel", "ready", "demo"] as const;

export function legacyImpactRedirect(basePath: string, params: { get(name: string): string | null; toString(): string } | null): string | null {
  if (!params) return null;
  if (!IMPACT_PARAMS.some((name) => params.get(name) !== null)) return null;
  const query = params.toString();
  return `${basePath}/views/impact${query ? `?${query}` : ""}`;
}
