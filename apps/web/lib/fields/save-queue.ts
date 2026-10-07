/** Saves go out at once (the API locks the row). While any save is pending, leaving or reloading asks first. */

const pending = new Map<string, number>();
let total = 0;

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

export function trackSave<T>(key: string, run: () => Promise<T>): Promise<T> {
  pending.set(key, (pending.get(key) ?? 0) + 1);
  total += 1;
  if (total === 1 && typeof window !== "undefined") window.addEventListener("beforeunload", warnBeforeLeaving);
  return run().finally(() => {
    const next = (pending.get(key) ?? 1) - 1;
    if (next <= 0) pending.delete(key);
    else pending.set(key, next);
    total -= 1;
    if (total === 0 && typeof window !== "undefined") window.removeEventListener("beforeunload", warnBeforeLeaving);
  });
}

/** Saves for this record that have not finished yet. */
export function savesWaiting(key: string): number {
  return pending.get(key) ?? 0;
}

/** Saves that have not finished yet, across every record. */
export function savesPending(): number {
  return total;
}
