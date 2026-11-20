/** Items grouped by a key, in first-seen order: what `Map.groupBy` does.
 *
 *  Map.groupBy needs Safari 17.4 (iOS 17.4, March 2024), past the
 *  browsers this site builds for, and it threw on older iPhones and took a
 *  shul's listing down with it (Nov 20, the health sweep).
 *  src/test/browserSupport.test.ts keeps it and its like out of src. */
export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}
