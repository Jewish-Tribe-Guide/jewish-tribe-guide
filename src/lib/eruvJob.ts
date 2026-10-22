import { eruvView, type EruvTone } from './eruv'
import type { AdminEruv } from './eruvStore'
import { detailsRows } from './eruvWebsite'
import { eruvSection, type JobCounts } from './watchJobs'
import type { Watch } from './watches'

// ── Eruv status, as drawn (Oct 22) ──────────────────────────────────────────
// Drawn on artifact 9Kv6MGeAEooZREzW28hiBu (agreed Oct 21): every eruv on
// one of three tabs, its pill saying why it's there.
//   To check     its website has an update for its Details ("1 update")
//   Can't be read  no status source ("No status"), an email it couldn't
//                make out, or a page that didn't load: its status page,
//                its map, or its website
//   Checked      the rest, its pill its status as visitors see it ("Up")
// Status and map go live at once, as they always have, so only Details
// ever waits to be checked.
//
// Pure: no network, no database.

/** What its website says, waiting (eruvWebsiteRun.ts): the two fields it
 *  reads, as filed. */
export type EruvFinding = { id: string; eruvId: string; at: string; hotline: string | null; alertsUrl: string | null }

export type EruvJobLoaded = { available: boolean; timezone: string; eruvim: AdminEruv[]; findings: EruvFinding[]; watches: Watch[] }

export type EruvJobTab = 'to_check' | 'cant_read' | 'checked'
export type EruvPill = { text: string; tone: EruvTone }

/** The website's watch for this eruv, by its address. */
export function websiteWatchOf(e: Pick<AdminEruv, 'website'>, watches: readonly Watch[]): Watch | null {
  const bare = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/#.*$/, '').replace(/\/+$/, '')
  return e.website ? watches.find((w) => bare(w.url) === bare(e.website!)) ?? null : null
}

/** How many rows of its Details the website would change. */
export function updatesOf(e: AdminEruv, finding: EruvFinding | null | undefined): number {
  if (!finding) return 0
  return detailsRows(e, { hotline: finding.hotline, alertsUrl: finding.alertsUrl }).filter((r) => r.mark !== 'same').length
}

const mapFailed = (e: Pick<AdminEruv, 'lineUrl' | 'lineError'>) => !!e.lineUrl && !!e.lineError
const siteFailed = (w: Watch | null) => !!w?.active && !!w.lastError

/** Its status as visitors see it, for its row and its Status box. */
export function statusPill(e: AdminEruv, now: Date, timezone: string): EruvPill {
  if (eruvSection(e) === 'no_source') return { text: 'No source', tone: 'grey' }
  // Read from its emails, and none has come yet.
  if (!e.statusUrl && e.statusEmail && !e.statusCheckedAt && !e.statusErrorAt) return { text: 'No word yet', tone: 'grey' }
  const v = eruvView(e, now, timezone, null)
  return { text: v.label, tone: v.tone }
}

/** Its tab and its row's pill. `didntLoad`: a page that didn't open, for
 *  the Watches tab's count. */
export function eruvStanding(
  e: AdminEruv,
  { finding, watch, now, timezone }: { finding?: EruvFinding | null; watch: Watch | null; now: Date; timezone: string },
): { tab: EruvJobTab; pill: EruvPill; didntLoad?: boolean } {
  const n = updatesOf(e, finding)
  if (n) return { tab: 'to_check', pill: { text: `${n} update${n === 1 ? '' : 's'}`, tone: 'amber' } }
  const section = eruvSection(e)
  if (section === 'no_source') return { tab: 'cant_read', pill: { text: 'No status', tone: 'grey' } }
  if (section === 'email') return { tab: 'cant_read', pill: { text: 'Email not read', tone: 'amber' } }
  if (section === 'didnt_load') return { tab: 'cant_read', pill: { text: 'Status didn’t load', tone: 'grey' }, didntLoad: true }
  if (mapFailed(e)) return { tab: 'cant_read', pill: { text: 'Map didn’t load', tone: 'grey' }, didntLoad: true }
  if (siteFailed(watch)) return { tab: 'cant_read', pill: { text: 'Website didn’t load', tone: 'grey' }, didntLoad: true }
  return { tab: 'checked', pill: statusPill(e, now, timezone) }
}

/** The finding waiting for each eruv: its newest. */
export function findingFor(findings: readonly EruvFinding[], eruvId: string): EruvFinding | null {
  return findings.filter((f) => f.eruvId === eruvId).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
}

/** The Watches tab's four counts, from the same standings the page shows. */
export function eruvJobCounts(d: Pick<EruvJobLoaded, 'eruvim' | 'findings' | 'watches' | 'timezone'>, now: Date): JobCounts {
  const out: JobCounts = { checked: 0, toCheck: 0, cantRead: 0, didntLoad: 0 }
  for (const e of d.eruvim) {
    const s = eruvStanding(e, { finding: findingFor(d.findings, e.id), watch: websiteWatchOf(e, d.watches), now, timezone: d.timezone })
    if (s.tab === 'to_check') out.toCheck++
    else if (s.tab === 'checked') out.checked++
    else if (s.didntLoad) out.didntLoad++
    else out.cantRead++
  }
  return out
}
