/** Comparing updated_at strings from the API (both naive or both with a zone; otherwise unknown). */

function hasZone(value: string): boolean {
  return /([zZ]|[+-]\d\d:?\d\d)$/.test(value);
}

/** -1 / 0 / 1 when both timestamps can be compared, null when they can't. */
export function compareUpdatedAt(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b || hasZone(a) !== hasZone(b)) return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return left === right ? 0 : left < right ? -1 : 1;
}
