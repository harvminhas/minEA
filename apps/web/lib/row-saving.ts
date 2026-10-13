/**
 * Optimistic per-row saving state for the Members tables and pending invites.
 * A row shows the new value at once, "Saving…" while the API call runs, a brief "Saved" tick on
 * success, and rolls back with the API's message on failure.
 */
export type RowStatus = "saving" | "saved" | "error";

export interface RowOverride {
  status: RowStatus;
  /** Optimistic role while saving / just saved. */
  role?: string;
  /** Remove / Revoke in progress: the row dims and says so, then hides once it succeeded. */
  removing?: boolean;
  /** Gone after a successful Remove / Revoke (until the refetch drops it). */
  hidden?: boolean;
  error?: string;
}

export type Overrides = Record<string, RowOverride>;

export const SAVED_TICK_MS = 1500;

export function applyOverrides<T extends { role: string }>(
  rows: T[] | undefined,
  idOf: (row: T) => string,
  overrides: Overrides
): T[] {
  return (rows ?? [])
    .filter((r) => !overrides[idOf(r)]?.hidden)
    .map((r) => {
      const o = overrides[idOf(r)];
      return o?.role && o.status !== "error" ? { ...r, role: o.role } : r;
    });
}

/** Strip the "403 " status prefix and "(path)" suffix that apiFetch adds to error messages. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Something went wrong");
  const m = raw.match(/^\d{3}\s+([\s\S]*?)(?:\s+\([^)]*\))?$/);
  let text = (m ? m[1] : raw).trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.detail === "string") text = parsed.detail;
  } catch {
    /* plain text */
  }
  return text || "Something went wrong";
}

/**
 * Run one row action: set the optimistic override, await the call, then tick or roll back.
 * `set` is a state setter for the Overrides map.
 */
export async function runRowAction(
  id: string,
  optimistic: Omit<RowOverride, "status">,
  call: () => unknown,
  set: (fn: (prev: Overrides) => Overrides) => void,
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)
): Promise<boolean> {
  set((prev) => ({ ...prev, [id]: { ...optimistic, status: "saving" } }));
  try {
    await call();
    set((prev) => ({ ...prev, [id]: { ...optimistic, status: "saved" } }));
    schedule(() => set((prev) => {
      if (prev[id]?.status !== "saved") return prev;
      const next = { ...prev };
      // Hidden rows stay hidden until the refetch drops them; role overrides clear once data has it.
      if (optimistic.removing) next[id] = { hidden: true, status: "saved" };
      else delete next[id];
      return next;
    }), SAVED_TICK_MS);
    return true;
  } catch (err) {
    set((prev) => ({ ...prev, [id]: { status: "error", error: friendlyError(err) } }));
    return false;
  }
}
