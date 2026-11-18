// Work on many things, a few at a time: the nightly syncs searched every
// place's website at once, and read every candidate page of one site at
// once, so a site with twenty links got twenty requests in the same moment
// (Nov 18 review). Results come back in the items' order.

export async function fewAtATime<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, lane))
  return out
}
