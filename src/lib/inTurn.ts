/** The list from position `turn` round to the start: a different first
 *  piece each night, so a nightly job with more work than time or budget
 *  doesn't leave the same pieces out every night, and ones that fail
 *  every night (a place OpenRouteService can't route to) can't take the
 *  whole budget night after night (Nov 18 review). */
export function inTurn<T>(items: readonly T[], turn = 0): T[] {
  if (!items.length) return []
  const at = ((Math.trunc(turn) % items.length) + items.length) % items.length
  return [...items.slice(at), ...items.slice(0, at)]
}

/** The day's number, for `turn`: one more each day. */
export const dayNumber = (now = Date.now()) => Math.floor(now / 86_400_000)
