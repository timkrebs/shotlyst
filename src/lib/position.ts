// Fractional ordering keys for `position` columns. A key is a string over the
// alphabet below, compared byte by byte (the columns use collation "C"). A
// new key always fits between two neighbours, so a move writes one row.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// A key strictly between `a` and `b`. `a` is "" for "before everything", `b`
// is null for "after everything". Neither may end in the lowest digit.
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // Keep the common prefix; a shorter `a` is padded with the lowest digit.
    let n = 0;
    while ((a[n] ?? DIGITS[0]) === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round(0.5 * (digitA + digitB))];
  // The first digits are neighbours.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

function assertKey(key: string) {
  if (key === "" || key.endsWith(DIGITS[0]) || [...key].some((char) => !DIGITS.includes(char))) {
    throw new Error(`Invalid position key: ${JSON.stringify(key)}`);
  }
}

// A position between two neighbours; null means "no neighbour on that side".
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null) assertKey(before);
  if (after !== null) assertKey(after);
  if (before !== null && after !== null && before >= after) {
    throw new Error("positionBetween: before must sort before after");
  }
  return midpoint(before ?? "", after);
}

export function positionAfter(last: string | null): string {
  return positionBetween(last, null);
}

// The position for an item dropped at `index` of a list that does not
// contain the item itself.
export function positionAt(sortedPositions: string[], index: number): string {
  const clamped = Math.max(0, Math.min(index, sortedPositions.length));
  return positionBetween(sortedPositions[clamped - 1] ?? null, sortedPositions[clamped] ?? null);
}

// Byte-wise comparison, the same order Postgres uses with collation "C".
export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
