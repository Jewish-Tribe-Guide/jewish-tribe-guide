import type { NightKindId } from './jobRuns'
import type { TrackedSource, ListSwitch } from './nightKinds'
import { placePath } from './placeLink'

// ── A Watches row, opened (board W4, Nov 25) ────────────────────────────────
// Two lists: Nothing to read (each with why, in amber) and Read (each with
// what it's read from). Shuls and mikvahs come from their job's places
// (/api/admin/watches/hours), eruvs from every eruv, so one with no source
// shows up as nothing to read rather than being left out. The other jobs
// split what they track by whether its last read went wrong.

export type JobPlaceRow = { key: string; name: string; line: string; page: string | null; watch?: ListSwitch }
export type JobPlaceLists = { missing: JobPlaceRow[]; read: JobPlaceRow[] }

type ReadWatch = { active: boolean; pageChangedAt?: string | null }
export type JobHoursPlace = { id: string; name: string; off: boolean; reason: string | null; pages: { watch: ReadWatch }[]; newsletters?: readonly ReadWatch[] }
export type JobEruv = { id: string; name: string; statusUrl: string | null; statusEmail: string | null; statusErrorAt: string | null; active?: boolean }

/** "No website on Google." reads as the board's "No website". */
const plain = (why: string) => (/^No website/.test(why) ? 'No website' : why.replace(/\.$/, ''))

const fromWords = (site: boolean, emails: boolean, page = 'Website') => (site && emails ? `${page} and emails` : site ? page : 'Emails')

const byName = (a: JobPlaceRow, b: JobPlaceRow) => a.name.localeCompare(b.name)

export function jobPlaceRows(
  id: NightKindId,
  from: { tracked: readonly TrackedSource[]; places?: readonly JobHoursPlace[] | null; eruvim?: readonly JobEruv[] | null },
  /** Of a job's places, those Nothing to read lists: Minyan times covers
   *  any category with minyanim (a restaurant's), but only a shul with
   *  nothing to read is missing anything. One read is listed whatever. */
  listsMissing: (id: string) => boolean = () => true,
): JobPlaceLists {
  const missing: JobPlaceRow[] = []
  const read: JobPlaceRow[] = []
  if ((id === 'times' || id === 'hours') && from.places) {
    for (const p of from.places) {
      const row = { key: p.id, name: p.name, page: placePath(p.id) }
      if (p.off) {
        if (listsMissing(p.id)) missing.push({ ...row, line: 'Turned off for this place' })
        continue
      }
      const site = p.pages.some((x) => x.watch.active) && !p.reason
      const emails = (p.newsletters ?? []).some((w) => w.active && !!w.pageChangedAt)
      if (site || emails) read.push({ ...row, line: fromWords(site, emails) })
      else if (listsMissing(p.id)) missing.push({ ...row, line: plain(p.reason ?? 'No website') })
    }
  } else if (id === 'eruvs' && from.eruvim) {
    for (const e of from.eruvim) {
      const row = { key: e.id, name: e.name, page: placePath(e.id) }
      const site = !!e.statusUrl && !e.statusErrorAt
      const emails = !!e.statusEmail
      if (site || emails) read.push({ ...row, line: fromWords(site, emails, 'Status page') })
      else missing.push({ ...row, line: e.statusUrl ? 'Its status page didn’t load' : 'No status page or email' })
    }
  } else {
    from.tracked.forEach((t, i) => {
      const row: JobPlaceRow = { key: `${t.name}-${i}`, name: t.name, line: t.status, page: t.page || null, ...(t.watch ? { watch: t.watch } : {}) }
      ;(t.bad ? missing : read).push(row)
    })
  }
  return { missing: missing.sort(byName), read: read.sort(byName) }
}
