/** Deterministic domain colour/icon from the name (and optional description).
 *  Keep the keyword rules in sync with apps/api/app/services/domain_theme.py. */

export const DOMAIN_THEMES = {
  strategy: { accent: "#7c74c7", tint: "#f3f1fc", ink: "#4c4496", icon: "compass" },
  land: { accent: "#6a9a6d", tint: "#f0f6ef", ink: "#3d6b40", icon: "land-plot" },
  construction: { accent: "#c9963d", tint: "#fbf5e9", ink: "#8a6416", icon: "hard-hat" },
  sales: { accent: "#c57a85", tint: "#fbf1f3", ink: "#9a4452", icon: "megaphone" },
  customer: { accent: "#6b92c4", tint: "#eef4fb", ink: "#3a5f8a", icon: "heart-handshake" },
  finance: { accent: "#5a9e93", tint: "#eef7f5", ink: "#2c6b62", icon: "circle-dollar-sign" },
  people: { accent: "#7b85c0", tint: "#f1f3fb", ink: "#44508f", icon: "users" },
  technology: { accent: "#7a8896", tint: "#f1f3f5", ink: "#45515c", icon: "layers" },
  generic: { accent: "#9aa0ab", tint: "#f3f4f8", ink: "#5c6370", icon: "layout-grid" },
} as const;

export type DomainThemeId = keyof typeof DOMAIN_THEMES;
export type DomainTheme = (typeof DOMAIN_THEMES)[DomainThemeId];

const RULES: [DomainThemeId, RegExp][] = [
  ["land", /\b(land|entitlement|entitlements|real[\s-]?estate|landhold)/i],
  ["construction", /\b(construction|home[\s-]?design|home[\s-]?build(?:ing)?|homebuilding|building|trades)\b/i],
  ["customer", /\b(customer|warranty|after[\s-]?sales|aftercare)\b/i],
  ["sales", /\b(sales|marketing|brand|advertising|campaigns?)\b/i],
  ["people", /\b(people|workforce|human[\s-]?resources|hr|talent|recruit|payroll)\b/i],
  ["finance", /\b(finance|financial|treasury|accounting|accounts?|funding|revenue|tax)\b/i],
  ["technology", /\b(technology|platforms?|infrastructure|information[\s-]?technology|\bit\b|digital|software|systems?)\b/i],
  ["strategy", /\b(strateg|governance|corporate[\s-]?planning|policy|policies|board|compliance)\b/i],
];

function matchTheme(text: string): DomainThemeId | null {
  if (!text.trim()) return null;
  for (const [theme, pattern] of RULES) {
    if (pattern.test(text)) return theme;
  }
  return null;
}

export function pickDomainTheme(name: string, description?: string | null): { color: DomainThemeId; icon: string } {
  // Prefer the name so a description like "systems for building…" cannot
  // override "Technology & Platforms" with the construction theme.
  const theme = matchTheme(name ?? "") ?? matchTheme(`${name ?? ""} ${description ?? ""}`) ?? "generic";
  return { color: theme, icon: DOMAIN_THEMES[theme].icon };
}

export function domainTheme(color?: string | null): DomainTheme {
  if (color && color in DOMAIN_THEMES) return DOMAIN_THEMES[color as DomainThemeId];
  return DOMAIN_THEMES.generic;
}

export function decorateDomain<T extends { name: string; description?: string | null; icon?: string | null; color?: string | null }>(domain: T): T {
  const picked = pickDomainTheme(domain.name, domain.description);
  return {
    ...domain,
    icon: domain.icon || picked.icon,
    color: domain.color || picked.color,
  };
}

export type DomainLike = {
  name?: string | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  properties?: Record<string, unknown> | null;
};

function textProp(properties: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = properties?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Stored business_domain.properties colour/icon, else the deterministic name theme. */
export function themeForDomain(domain?: DomainLike | null): Omit<DomainTheme, "icon"> & { color: DomainThemeId; icon: string } {
  const decorated = decorateDomain({
    name: domain?.name ?? "",
    description: domain?.description ?? textProp(domain?.properties, "description"),
    color: domain?.color ?? textProp(domain?.properties, "color"),
    icon: domain?.icon ?? textProp(domain?.properties, "icon"),
  });
  const color = (decorated.color && decorated.color in DOMAIN_THEMES ? decorated.color : "generic") as DomainThemeId;
  const theme = domainTheme(color);
  return { ...theme, color, icon: decorated.icon || theme.icon };
}
