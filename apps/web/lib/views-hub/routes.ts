/** Query params the impact view reads; /views with any of them is an old impact link. */
export const IMPACT_PARAMS = ["tab", "sel", "ready", "demo"] as const;

export function legacyImpactRedirect(basePath: string, params: { get(name: string): string | null; toString(): string } | null): string | null {
  if (!params) return null;
  if (!IMPACT_PARAMS.some((name) => params.get(name) !== null)) return null;
  const query = params.toString();
  return `${basePath}/views/impact${query ? `?${query}` : ""}`;
}

/** Reports opened from a hub card carry ?from=views so they can link back to the hub. */
export const FROM_VIEWS = "from=views";

export function withFromViews(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${FROM_VIEWS}`;
}

export function cameFromViews(params: { get(name: string): string | null } | null): boolean {
  return params?.get("from") === "views";
}
