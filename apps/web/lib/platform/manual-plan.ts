import { CATALOG, type CatalogPlanId } from "@/lib/billing/plans";

/** Plans a platform admin may set by hand (Team is retired). Mirrors HAND_PLANS in app/services/manual_plan.py. */
export const HAND_PLANS = ["free", "starter", "business"] as const satisfies readonly CatalogPlanId[];
export type HandPlan = (typeof HAND_PLANS)[number];

export const STRIPE_BLOCK = "This org pays through Stripe. Cancel in Stripe first, then change the plan here.";

const n = (value: number) => value.toLocaleString("en-US");

export function planLabel(plan: string): string {
  return CATALOG[plan as CatalogPlanId]?.label ?? (plan ? plan[0]!.toUpperCase() + plan.slice(1) : "Free");
}

export function planSummary(plan: HandPlan): string {
  const p = CATALOG[plan];
  const apps = p.appsAgentsPerWorkspace == null ? "unlimited" : `${n(p.appsAgentsPerWorkspace)} apps & agents`;
  return `${p.licences} licence${p.licences === 1 ? "" : "s"} · ${apps} · ${n(p.aiAnswersPerMonth)} AI answers/mo`;
}

/** "Free → Business: licences 1 → 10, AI answers 25 → 5,000." */
export function changeSummary(from: string, to: HandPlan): string {
  const a = CATALOG[from as CatalogPlanId] ?? CATALOG.free;
  const b = CATALOG[to];
  const parts: string[] = [];
  if (a.licences !== b.licences) parts.push(`licences ${a.licences} → ${b.licences}`);
  if (a.aiAnswersPerMonth !== b.aiAnswersPerMonth) parts.push(`AI answers ${n(a.aiAnswersPerMonth)} → ${n(b.aiAnswersPerMonth)}`);
  if (a.appsAgentsPerWorkspace !== b.appsAgentsPerWorkspace) {
    const apps = (v: number | null) => (v == null ? "unlimited" : n(v));
    parts.push(`apps & agents ${apps(a.appsAgentsPerWorkspace)} → ${apps(b.appsAgentsPerWorkspace)}`);
  }
  const lead = `${planLabel(from)} → ${b.label}`;
  const tail = b.licences < a.licences ? " People already editing keep access; nobody new can be added." : " Nobody loses access.";
  return `${lead}${parts.length ? `: ${parts.join(", ")}.` : "."}${tail}`;
}

/** "Set by hand · harvinder@… · Oct 20, 2026 · Pilot" */
export function manualNote(change: { by: string | null; at: string | null; reason: string | null } | null | undefined): string {
  if (!change) return "";
  const date = change.at ? new Date(change.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  return ["Set by hand", change.by ?? "", date, change.reason ? `“${change.reason}”` : ""].filter(Boolean).join(" · ");
}
