/** Runs `work` on every item, at most `n` at once, and resolves when all
 *  have: for a write to each of many rows, where one at a time was slow
 *  (a category's listings, Nov 20) and all at once would open a
 *  connection per row. The first that throws rejects it; those already
 *  going finish, and no more start. */
export async function atMostAtOnce<T>(n: number, items: readonly T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++]
      try {
        await work(item)
      } catch (err) {
        failed = true
        throw err
      }
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: Math.min(n, items.length) }, worker))
  const rejected = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')
  if (rejected) throw rejected.reason
}
