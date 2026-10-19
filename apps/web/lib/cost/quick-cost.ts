import type { CostLine } from "@/lib/cost/math";

/**
 * Read what someone types into a table's quick cost box as an annual amount in cents.
 * Accepts 1200, $1,200, 1 200, 1200.50, 1.2k, 12K, 1200/yr. Empty is null (nothing to save);
 * anything else unreadable or not above zero is "invalid".
 */
export function parseQuickAmount(text: string): number | null | "invalid" {
  let cleaned = text.trim().toLowerCase();
  if (!cleaned) return null;
  cleaned = cleaned
    .replace(/\s*(\/\s*(yr|year)|per\s+year|a\s+year|annual(ly)?|pa|p\.a\.)\s*$/, "")
    .replace(/^(usd|us\$|\$)\s*/, "")
    .replace(/\s*(usd)$/, "")
    .replace(/[,\s]/g, "");
  let multiplier = 1;
  if (/k$/.test(cleaned)) {
    multiplier = 1000;
    cleaned = cleaned.slice(0, -1);
  } else if (/m$/.test(cleaned)) {
    multiplier = 1_000_000;
    cleaned = cleaned.slice(0, -1);
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return "invalid";
  const cents = Math.round(Number(cleaned) * multiplier * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : "invalid";
}

export const QUICK_AMOUNT_HINT = "Type an annual amount, like 1200 or $4,500";

/** The record's cost lines with the quick annual estimate added; existing lines are kept. */
export function withQuickCostLine(
  existing: CostLine[] | null | undefined,
  { cents, vendor, actor, id, now }: { cents: number; vendor: string | null; actor: string; id: string; now: string }
): CostLine[] {
  const line: CostLine = {
    id,
    type: "subscription",
    amount_cents: cents,
    frequency: "annual",
    calculation: { kind: "flat" },
    vendor,
    source: "estimate",
    created_at: now,
    created_by: actor,
    updated_at: now,
    updated_by: actor,
  };
  return [...(existing ?? []), line];
}

/** What a key or focus change in the box does: save it, drop it, or nothing yet. */
export function quickCostIntent(event: { type: "keydown"; key: string } | { type: "blur" }): "commit" | "cancel" | null {
  if (event.type === "blur") return "commit";
  if (event.key === "Enter") return "commit";
  if (event.key === "Escape") return "cancel";
  return null;
}
