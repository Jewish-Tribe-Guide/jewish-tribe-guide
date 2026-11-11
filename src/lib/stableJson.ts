/** JSON with every object's keys in order and nothing for an unset key, so
 *  two values that say the same are the same string: what the admin's
 *  change counts compare (the user, Nov 10: "even just clicking something
 *  triggers a change"). Arrays keep their order, since order is content. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .filter((k) => (x as Record<string, unknown>)[k] !== undefined && (x as Record<string, unknown>)[k] !== null)
            .map((k) => [k, (x as Record<string, unknown>)[k]]),
        )
      : x,
  )
}
