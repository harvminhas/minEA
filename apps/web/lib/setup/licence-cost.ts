import type { CostLine } from "@/lib/cost/math";

export function licenceCount(value: string | number | null | undefined): number | null {
  const n = Math.floor(Number(String(value ?? "").replace(/[,\s]/g, "")));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Yearly cost for the setup table. Only a catalogue per-licence price is multiplied, and only while
 * the yearly cell is still "typical" (a total the person typed is kept as-is). Without a per-seat
 * price the old behaviour stays: the catalogue's typicalAnnual, or nothing.
 */
export function yearlyFor(
  tool: { typicalAnnual: number | null; typicalPerSeatMonthly?: number | null } | null | undefined,
  licences: string,
  current: { yearly: string; typical: boolean },
): { yearly: string; typical: boolean } {
  if (!current.typical && current.yearly.trim()) return current;
  const seats = licenceCount(licences);
  const perSeat = tool?.typicalPerSeatMonthly;
  if (seats && perSeat && perSeat > 0) return { yearly: String(Math.round(perSeat * 12 * seats)), typical: true };
  if (tool?.typicalAnnual) return { yearly: String(tool.typicalAnnual), typical: true };
  return { yearly: current.typical ? "" : current.yearly, typical: false };
}

/** The per-licence "typical" cost line saved for an app (seats × list price). */
export function perSeatLine(seats: number, perSeatMonthly: number, vendor: string, user = "setup", now = new Date().toISOString()): CostLine {
  return {
    id: crypto.randomUUID(),
    type: "subscription",
    frequency: "annual",
    calculation: { kind: "per_user", seats, unit_price_monthly_cents: Math.round(perSeatMonthly * 100) },
    vendor: vendor || null,
    source: "estimate",
    notes: "typical",
    created_at: now,
    created_by: user,
    updated_at: now,
    updated_by: user,
  };
}
