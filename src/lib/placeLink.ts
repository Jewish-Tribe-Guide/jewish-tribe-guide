// Where one place opens under Watches (the one-place screen, Oct 31), and
// where its Back goes: `from` is the screen that linked it, To do or a job.

export type PlaceFrom = 'todo' | `job/${string}`

/** The path under the Watches tab: "place/<id>", or with `from`. */
export const placePath = (id: string, from?: PlaceFrom) => `place/${encodeURIComponent(id)}${from ? `?from=${from}` : ''}`

/** A line's page, sent back to `from`; a page that isn't a place (a job's own) as it is. */
export const pageFrom = (page: string, from: PlaceFrom) => (page.startsWith('place/') ? `${page}?from=${from}` : page)

/** The way back, by what linked it. Anything else in the address, Watches. */
export function placeBack(from: string | null | undefined, base: string, jobName: (id: string) => string | undefined): { label: string; href: string } {
  if (from === 'todo') return { label: 'To do', href: base }
  const job = from?.match(/^job\/([a-z-]+)$/)?.[1]
  const name = job && jobName(job)
  if (name) return { label: name, href: `${base}/watches/job/${job}` }
  return { label: 'Watches', href: `${base}/watches` }
}
