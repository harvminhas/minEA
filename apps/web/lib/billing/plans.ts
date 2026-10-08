/**
 * Plan catalogue for the pricing page and admin centre.
 * Mirrors apps/api/app/services/plans.json (the canonical copy the API and Stripe bootstrap use);
 * plans-parity.test.ts fails if the two drift. Enforcement lives in the API.
 */

export type PackId = "starter" | "team" | "business";
export type CatalogPlanId = "free" | PackId;
/** What the admin centre shows. business_legacy = an org already on Business before packs. */
export type DisplayPlanId = CatalogPlanId | "business_legacy";
export type BillingInterval = "monthly" | "yearly";

export interface CatalogPlan {
  id: CatalogPlanId;
  label: string;
  tagline: string;
  /** Licences = people who can edit. Viewers are free and unlimited on every plan. */
  licences: number;
  monthlyUsd: number;
  yearlyUsd: number;
  aiAnswersPerMonth: number;
  /** null = unlimited */
  appsPlatforms: number | null;
  onboardingHours: number;
  highlights: string[];
}

export const PRICE_NOTE = "Prices in USD. Taxes may apply.";
export const VIEWERS_NOTE = "Viewers are free and unlimited on every plan.";

export const CATALOG: Record<CatalogPlanId, CatalogPlan> = {
  free: {
    id: "free",
    label: "Free",
    tagline: "Try BuboMap on your own estate.",
    licences: 1,
    monthlyUsd: 0,
    yearlyUsd: 0,
    aiAnswersPerMonth: 25,
    appsPlatforms: 25,
    onboardingHours: 0,
    highlights: ["All reports and views", "One workspace, one share link"],
  },
  starter: {
    id: "starter",
    label: "Starter",
    tagline: "One editor mapping the whole estate.",
    licences: 1,
    monthlyUsd: 99,
    yearlyUsd: 990,
    aiAnswersPerMonth: 500,
    appsPlatforms: null,
    onboardingHours: 0,
    highlights: [
      "Unlimited workspaces and repository objects",
      "AI architecture chat",
      "Share links for views, roadmaps and objects",
    ],
  },
  team: {
    id: "team",
    label: "Team",
    tagline: "CTO, security and infrastructure on one map.",
    licences: 5,
    monthlyUsd: 449,
    yearlyUsd: 4490,
    aiAnswersPerMonth: 2500,
    appsPlatforms: null,
    onboardingHours: 4,
    highlights: ["Everything in Starter"],
  },
  business: {
    id: "business",
    label: "Business",
    tagline: "For larger IT teams keeping the estate current.",
    licences: 10,
    monthlyUsd: 799,
    yearlyUsd: 7990,
    aiAnswersPerMonth: 5000,
    appsPlatforms: null,
    onboardingHours: 4,
    highlights: ["Everything in Team"],
  },
};

export const PACK_ORDER: PackId[] = ["starter", "team", "business"];
export const PLAN_ORDER: CatalogPlanId[] = ["free", ...PACK_ORDER];

export function priceFor(plan: CatalogPlan, interval: BillingInterval): number {
  return interval === "yearly" ? plan.yearlyUsd : plan.monthlyUsd;
}

/** How much a year costs on monthly billing minus the yearly price. */
export function yearlySavingsUsd(plan: CatalogPlan): number {
  return plan.monthlyUsd * 12 - plan.yearlyUsd;
}

export function monthsFreeOnYearly(plan: CatalogPlan): number {
  if (plan.monthlyUsd === 0) return 0;
  return Math.round(yearlySavingsUsd(plan) / plan.monthlyUsd);
}

/** Yearly price spread over 12 months, to the cent. */
export function yearlyPerMonthUsd(plan: CatalogPlan): number {
  return Math.round((plan.yearlyUsd / 12) * 100) / 100;
}

export function perLicencePerMonthUsd(plan: CatalogPlan, interval: BillingInterval): number {
  const monthly = interval === "yearly" ? plan.yearlyUsd / 12 : plan.monthlyUsd;
  return Math.round((monthly / plan.licences) * 100) / 100;
}

export function formatUsd(amount: number): string {
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export function priceLabel(plan: CatalogPlan, interval: BillingInterval): string {
  if (plan.monthlyUsd === 0) return "$0";
  return `${formatUsd(priceFor(plan, interval))}${interval === "yearly" ? "/yr" : "/mo"}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** "What's included" lines for a pricing card. */
export function planIncludes(plan: CatalogPlan): string[] {
  const lines: string[] = [];
  lines.push(
    plan.id === "free"
      ? "1 editor"
      : `${plan.licences} licence${plan.licences === 1 ? "" : "s"} (people who edit)`
  );
  lines.push("Unlimited free viewers");
  lines.push(
    plan.appsPlatforms == null
      ? "Unlimited apps & platforms"
      : `Up to ${plan.appsPlatforms} apps & platforms`
  );
  lines.push(`${formatCount(plan.aiAnswersPerMonth)} AI answers / month`);
  lines.push(...plan.highlights);
  if (plan.onboardingHours > 0) {
    lines.push(`${plan.onboardingHours} hours of onboarding included`);
  }
  return lines;
}

/**
 * Mapping from a plan slug plus a KNOWN subscription flag to what the admin centre shows.
 * starter/team/business are packs (set by Stripe); "business" without a subscription is a
 * grandfathered Business (legacy) org. Pre-pack slugs solo/growth also mean Business.
 * Only call this with a loaded billing status; the page uses planFromStatus.
 */
export function resolveDisplayPlan(
  source: { plan?: string | null; hasSubscription?: boolean | null },
  preview?: CatalogPlanId | null
): DisplayPlanId {
  if (preview) return preview;
  const raw = (source.plan ?? "free").trim().toLowerCase();
  const plan = raw === "solo" || raw === "growth" ? "business" : raw;
  if (plan === "starter" || plan === "team") return plan;
  if (plan === "business") return source.hasSubscription ? "business" : "business_legacy";
  return "free";
}

const DISPLAY_PLAN_IDS: readonly string[] = ["free", "starter", "team", "business", "business_legacy"];

/** The fields of GET /billing/status that decide the plan shown. */
export interface PlanStatusSource {
  plan?: string | null;
  has_subscription?: boolean | null;
  display_plan?: string | null;
}

/**
 * The plan the admin centre shows, taken from GET /billing/status only. null = not loaded yet,
 * and the page shows a loading state with no plan buttons.
 *
 * Never guessed from org.plan: "business" there can't tell Business (legacy) from a Business
 * pack bought through Stripe. Guessing is what showed "Business (legacy)" with Switch buttons
 * while the status request was still in flight after a portal plan switch.
 * The API's display_plan already checks Stripe for a subscription the org row doesn't show yet.
 */
export function planFromStatus(
  status: PlanStatusSource | null | undefined,
  preview?: CatalogPlanId | null
): DisplayPlanId | null {
  if (preview) return preview;
  if (!status) return null;
  const fromApi = (status.display_plan ?? "").trim().toLowerCase();
  if (DISPLAY_PLAN_IDS.includes(fromApi)) {
    // Belt and braces: a subscription means it is not legacy, whatever the label says.
    if (fromApi === "business_legacy" && status.has_subscription) return "business";
    return fromApi as DisplayPlanId;
  }
  return resolveDisplayPlan({ plan: status.plan, hasSubscription: !!status.has_subscription });
}

export interface DisplayEntitlements {
  id: DisplayPlanId;
  label: string;
  /** null = unchanged legacy limits */
  licences: number | null;
  aiAnswersPerMonth: number | null;
  appsPlatforms: number | null;
  onboardingHours: number;
  isLegacy: boolean;
  isPack: boolean;
}

export function entitlementsFor(id: DisplayPlanId): DisplayEntitlements {
  if (id === "business_legacy") {
    return {
      id,
      label: "Business (legacy)",
      licences: null,
      aiAnswersPerMonth: null,
      appsPlatforms: null,
      onboardingHours: 0,
      isLegacy: true,
      isPack: false,
    };
  }
  const plan = CATALOG[id];
  return {
    id,
    label: plan.label,
    licences: plan.licences,
    aiAnswersPerMonth: plan.aiAnswersPerMonth,
    appsPlatforms: plan.appsPlatforms,
    onboardingHours: plan.onboardingHours,
    isLegacy: false,
    isPack: id !== "free",
  };
}

export type PlanChange =
  | { kind: "current" }
  | { kind: "upgrade" }
  | { kind: "downgrade" }
  | { kind: "switch" }
  | { kind: "blocked"; unassignFirst: number };

/** Moving between packs is free in either direction, as long as licences in use fit. */
export function planChangeFor(
  current: DisplayPlanId,
  target: PackId,
  licencesInUse: number
): PlanChange {
  if (current === target) return { kind: "current" };
  const targetLicences = CATALOG[target].licences;
  if (licencesInUse > targetLicences) {
    return { kind: "blocked", unassignFirst: licencesInUse - targetLicences };
  }
  if (current === "free") return { kind: "upgrade" };
  if (current === "business_legacy") return { kind: "switch" };
  return CATALOG[target].monthlyUsd > CATALOG[current].monthlyUsd
    ? { kind: "upgrade" }
    : { kind: "downgrade" };
}

export function nextPackWithRoom(licencesNeeded: number, after?: DisplayPlanId): PackId | null {
  const start = after && after !== "free" && after !== "business_legacy" ? PACK_ORDER.indexOf(after) + 1 : 0;
  for (const id of PACK_ORDER.slice(start)) {
    if (CATALOG[id].licences >= licencesNeeded) return id;
  }
  return null;
}

export function showsOnboarding(id: DisplayPlanId): boolean {
  return entitlementsFor(id).onboardingHours > 0;
}

/** Booking link for onboarding hours. Only http(s) URLs are used; anything else = not set. */
export function onboardingBookingUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_ONBOARDING_BOOKING_URL
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const PREVIEW_PLANS: CatalogPlanId[] = ["free", "starter", "team", "business"];

/** ?preview= value for the dev-only switch. Ignored entirely when the switch is off. */
export function parsePreviewPlan(
  raw: string | null | undefined,
  previewEnabled: boolean
): CatalogPlanId | null {
  if (!previewEnabled || !raw) return null;
  const value = raw.trim().toLowerCase() as CatalogPlanId;
  return PREVIEW_PLANS.includes(value) ? value : null;
}
