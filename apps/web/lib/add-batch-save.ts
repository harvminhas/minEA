/**
 * POST .../objects/batch safety for long lists.
 *
 * Idempotency-Key: every batch body gets a key, and the same body keeps the same key until it saves.
 * If the browser gives up (proxy timeout, 5xx, dropped connection) while the API is still saving,
 * clicking Add again with the same items sends the same key, and the API returns the first save's
 * result instead of creating every item twice. Once a save succeeds its key is dropped, so adding
 * the same names later (e.g. after Undo) is a new save.
 */

export const STILL_SAVING_MESSAGE = "Still saving — a long list can take a minute. Refresh before adding again.";

const KEY_TTL_MS = 30 * 60 * 1000;
const pendingKeys = new Map<string, { key: string; at: number }>();

function newKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `add-${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
}

/** The key for this batch body: reused while the same body hasn't saved yet. */
export function batchKeyFor(body: string, now: number = Date.now(), make: () => string = newKey): string {
  for (const [stored, entry] of pendingKeys) {
    if (now - entry.at > KEY_TTL_MS) pendingKeys.delete(stored);
  }
  const existing = pendingKeys.get(body);
  if (existing) return existing.key;
  const key = make();
  pendingKeys.set(body, { key, at: now });
  return key;
}

/** The body saved: a later identical Add is a new save with a new key. */
export function batchSaved(body: string): void {
  pendingKeys.delete(body);
}

/** True when the save may still be running on the server: a 5xx (504 proxy timeout, 502, 503)
 *  or no response at all (fetch threw). A 4xx means the API answered and saved nothing. */
export function maybeStillSaving(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const status = Number(message.slice(0, 3));
  return Number.isInteger(status) && status >= 500 && status < 600;
}

export function addSaveErrorMessage(err: unknown): string {
  if (maybeStillSaving(err)) return STILL_SAVING_MESSAGE;
  return err instanceof Error ? err.message : "Could not save";
}
