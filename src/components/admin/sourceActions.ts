import { samePage } from '@/lib/hoursJob'
import { sourceKind, sourceProblem } from '@/lib/watchPurposes'
import type { AddSource, Again, Change, ReadStep, Stop } from './openedPlaceBoxes'

// What a place's sources can have done to them, from wherever they're shown:
// its screen on To do (OpenedPlace.tsx) and its Places listing
// (PlaceListing.tsx). Each is a request or two to its job's own route.

type Post = <T>(path: string, body: Record<string, unknown>) => Promise<T>
const hoursApi = (job: 'hours' | 'times') => `/api/admin/watches/hours${job === 'times' ? '?job=times' : ''}`

/** A read that said whether it worked, and what trying again does: the
 *  source is read by then, so it isn't what the first try did. */
export type Attempt = (value: string) => Promise<{ failed: boolean; next?: Attempt }>

type PageReply = { pages?: { watch: { id: string; url: string; lastError?: string | null } }[]; read?: string[] }

export function sourceActions(placeId: string, post: Post) {
  // Each of its jobs read, one after another; a shul's or mikvah's pages
  // one request each, as its job page reads them.
  async function readStep(s: ReadStep) {
    if (s.job === 'dishes') return post('/api/admin/main-dishes', { action: 'read', resourceId: s.resourceId })
    if (s.job === 'refuah' || s.job === 'watch') return post('/api/admin/watches', { action: 'check', id: s.watchId })
    if (s.job === 'eruv') return post('/api/admin/eruvim', { id: s.id, action: 'check' })
    // Its website, given its watch first when the daily run hasn't yet.
    if (s.job === 'eruv-site') return post('/api/admin/watches/eruv', { action: 'read', id: s.id })
    const res = await post<{ read?: string[] }>(hoursApi(s.job), { action: 'check', resourceId: s.resourceId })
    for (const id of res.read ?? []) await post(hoursApi(s.job), { action: 'check', resourceId: s.resourceId, id })
  }

  async function change(c: Change, url: string) {
    if (c.kind === 'page') await post(hoursApi(c.job), { action: 'give', resourceId: placeId, url, replaces: c.replaces })
    else if (c.kind === 'newsletter') {
      const problem = sourceKind(url) === 'email' ? null : 'Give the email address its newsletter comes from.'
      if (problem) throw new Error(problem)
      await post('/api/admin/watches', { action: 'add', purpose: 'times', url, resourceId: placeId })
      await post('/api/admin/watches', { action: 'remove', id: c.replaces })
    } else if (c.kind === 'menu') await post('/api/admin/main-dishes', { action: 'link', resourceId: placeId, url })
    else if (c.kind === 'eruv-status') await eruvSource(url)
    else if (c.kind === 'eruv-map') {
      const problem = sourceProblem('hours', url)
      if (problem) throw new Error(problem)
      await post('/api/admin/eruvim', { id: placeId, action: 'save', edit: { lineUrl: url } })
      await post('/api/admin/eruvim', { id: placeId, action: 'check' })
    } else if (c.kind === 'eruv-website') await post('/api/admin/eruvim', { id: placeId, action: 'save', edit: { website: url } })
    else if (c.kind === 'keystone') await post('/api/admin/watches/kosher', { action: 'page', resourceId: placeId, url })
    else await post('/api/admin/watches/hospitals', { action: 'choose', resourceId: placeId, url })
  }

  /** An eruv's one source for its status (eruvEdit.ts): a page or the
   *  address its emails come from, the other emptied; a page read now. */
  async function eruvSource(source: string, dated?: boolean) {
    const problem = sourceProblem('eruv', source)
    if (problem) throw new Error(problem)
    const email = sourceKind(source) === 'email'
    const edit = email ? { statusEmail: source, statusUrl: '' } : { statusUrl: source, statusEmail: '', ...(dated === undefined ? {} : { statusDated: dated }) }
    await post('/api/admin/eruvim', { id: placeId, action: 'save', edit })
    if (!email) await post('/api/admin/eruvim', { id: placeId, action: 'check' })
  }

  async function stopSource(s: Stop) {
    if (s.kind === 'watch') await post('/api/admin/watches', { action: 'pause', id: s.watchId })
    else if (s.kind === 'page') await post(hoursApi(s.job), { action: 'stop', resourceId: placeId, id: s.watchId })
    else if (s.kind === 'menu') await post('/api/admin/main-dishes', { action: s.action, resourceId: placeId })
    else if (s.kind === 'refuah') await post('/api/admin/watches/hospitals', { action: 'stop', resourceId: placeId })
    else await post('/api/admin/eruvim', { id: s.id, action: 'save', edit: s.kind === 'eruv-status' ? { statusUrl: '', statusEmail: '' } : { lineUrl: '' } })
  }

  /** Read it again: a source turned off or stopped, read from now on. */
  async function readAgain(a: Again) {
    if (a.kind === 'place') await post(hoursApi(a.job), { action: 'on', resourceId: placeId })
    else if (a.kind === 'page') await post(hoursApi(a.job), { action: 'again', resourceId: placeId, id: a.watchId })
    else if (a.kind === 'refuah') await post('/api/admin/watches/hospitals', { action: 'on', resourceId: placeId })
    else if (a.kind === 'menu') await post('/api/admin/main-dishes', { action: 'undo_no_menu', resourceId: placeId })
    else await post('/api/admin/watches', { action: 'resume', id: a.watchId })
  }

  async function addSource(a: AddSource, url: string) {
    if (a.job === 'eruv') return eruvSource(url)
    const problem = sourceProblem(a.job === 'times' ? 'times' : 'hours', url)
    if (problem) throw new Error(problem)
    if (a.job === 'dishes') await post('/api/admin/main-dishes', { action: 'link', resourceId: placeId, url })
    else if (sourceKind(url) === 'email') await post('/api/admin/watches', { action: 'add', purpose: 'times', url, resourceId: placeId })
    else await post(hoursApi(a.job), { action: 'give', resourceId: placeId, url })
  }

  // ── Start reading (Restart6, RestartFail6): read at once, and said so ────

  /** A shul's or mikvah's page: its address as given, read now. */
  const readPage =
    (job: 'hours' | 'times', watchId: string, was: string): Attempt =>
    async (value) => {
      const moved = !samePage(value, was)
      const reply = await post<PageReply>(hoursApi(job), moved ? { action: 'give', resourceId: placeId, url: value, replaces: watchId } : { action: 'check', resourceId: placeId, id: watchId })
      const page = reply.pages?.map((p) => p.watch).find((w) => samePage(w.url, value))
      return { failed: !page || !!page.lastError, next: readPage(job, page?.id ?? watchId, value) }
    }

  const readMenu: Attempt = async (value) => {
    const reply = await post<{ reading?: { status?: string } | null }>('/api/admin/main-dishes', value ? { action: 'link', resourceId: placeId, url: value } : { action: 'read', resourceId: placeId })
    return { failed: reply.reading?.status === 'failed', next: readMenu }
  }

  const readRefuah: Attempt = async (value) => {
    const reply = await post<{ watch?: { lastError?: string | null } | null }>('/api/admin/watches/hospitals', { action: 'choose', resourceId: placeId, url: value })
    return { failed: !reply.watch || !!reply.watch.lastError, next: readRefuah }
  }

  /** What Start reading does for a source stopped, its address as it was. */
  function startReading(a: Again, was: string): Attempt {
    if (a.kind === 'page')
      return async (value) => {
        await post(hoursApi(a.job), { action: 'again', resourceId: placeId, id: a.watchId })
        return readPage(a.job, a.watchId, was)(value)
      }
    if (a.kind === 'place')
      return async (value) => {
        await post(hoursApi(a.job), { action: 'on', resourceId: placeId })
        const reply = await post<PageReply>(hoursApi(a.job), { action: 'check', resourceId: placeId })
        const first = reply.read?.[0] ?? reply.pages?.[0]?.watch.id
        if (!first) {
          await post(hoursApi(a.job), { action: 'give', resourceId: placeId, url: value })
          return { failed: false }
        }
        return readPage(a.job, first, was)(value)
      }
    if (a.kind === 'menu')
      return async (value) => {
        await post('/api/admin/main-dishes', { action: 'undo_no_menu', resourceId: placeId })
        return readMenu(value)
      }
    if (a.kind === 'refuah') return readRefuah
    return async () => {
      await post('/api/admin/watches', { action: 'resume', id: a.watchId })
      const reply = await post<{ watch?: { lastError?: string | null } }>('/api/admin/watches', { action: 'check', id: a.watchId })
      return { failed: !!reply.watch?.lastError }
    }
  }

  return { readStep, change, eruvSource, stopSource, readAgain, addSource, startReading, readPage }
}
