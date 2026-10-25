import { scheduleProposal, type ProposalRow, type WeekProposal } from '@/lib/timesProposal'
import { TIMES_PART_LABELS } from '@/lib/timesParts'
import { statusPill } from '@/lib/eruvJob'
import { sentThroughSite } from '@/lib/watchJobs'
import { day, shortUrl } from './JobPage'
import { partPages, usualRows, type ShulPlace } from './TimesProposal'
import { sectionPages, type ListedSection, type MikvahPlace } from './MikvahHours'
import type { ListedBox } from './HospitalsJob'
import type { Jobs } from './useWatchJobs'
import type { GoogleFieldRow } from '@/lib/googleJob'

// ── A place up to date, opened on its kind's page (piece 2, Oct 25) ─────────
// Drawn on FinalShuls3, FinalPhoneShul3, FinalAddSource3 and
// FinalFoodMenus3 (settled Oct 24): a box per part of the listing a watch
// keeps, each with the listing's values and, at its foot, where they're
// read from: "Same as mekorhabracha.org/davening · read Oct 23 · Change".
// Under the boxes, once for the place: Add a source, Read it now (Read them
// now for several pages), Open its listing.
//
// What goes in it is put together here from each job's own places, as the
// Watches tab loads them (useWatchJobs.ts), so the boxes say what the job
// pages do. The page draws them (OpenedPlace.tsx).

/** Its own page, given instead of the one a box is read from. */
export type Change =
  | { kind: 'page'; job: 'hours' | 'times'; replaces: string }
  | { kind: 'newsletter'; replaces: string }
  | { kind: 'menu' }
  | { kind: 'refuah' }

export type FootLink = { text: string; url: string | null }
/** "Same as its Google listing · read Oct 19". */
export type Foot = { lead: string; links: FootLink[]; when: string | null; mail?: boolean; change?: Change }

type Row = { name: string; sub?: string; right?: string }
export type OpenedBox = { key: string; title: string; foot: Foot } & (
  | { kind: 'usual'; rows: ProposalRow[] }
  | { kind: 'week'; week: WeekProposal }
  | { kind: 'section'; section: ListedSection }
  | { kind: 'people'; box: ListedBox }
  | { kind: 'rows'; groups: { head: string; rows: Row[] }[] }
)

/** What Read it now reads, one after another. */
export type ReadStep = { job: 'hours' | 'times'; resourceId: string } | { job: 'dishes'; resourceId: string } | { job: 'refuah'; watchId: string } | { job: 'eruv'; id: string }

/** What Add a source takes: a page, or for a shul a newsletter's email too. */
export type AddSource = { job: 'hours' | 'times' | 'dishes'; email: boolean; label: string }

export type Opened = { boxes: OpenedBox[]; reads: ReadStep[]; pages: number; add: AddSource | null }

const read = (at: string | null | undefined) => (at ? `read ${day(at)}` : null)
const pageLink = (url: string): FootLink => ({ text: shortUrl(url), url })
const isoDay = (now: number) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** Google's fields, its website's and the ones a person checked, each in
 *  a box of its own: "Name and contact", or "Hours and contact" when it
 *  has the hours (the drawings'). */
function fieldsTitle(rows: readonly GoogleFieldRow[]): string {
  return rows.some((r) => r.field === 'hours') ? 'Hours and contact' : 'Name and contact'
}
// A website as the drawing has it: "ccshul.com".
const fieldRows = (rows: readonly GoogleFieldRow[]): Row[] => rows.map((r) => ({ name: r.label, right: r.field === 'website' ? shortUrl(r.value) : r.value }))

export function openedPlace(id: string, jobs: Jobs, now: number): Opened {
  const boxes: OpenedBox[] = []
  const reads: ReadStep[] = []
  let pages = 0
  let add: AddSource | null = null
  // Its own website's first page, for a field the website keeps.
  let site: string | null = null

  // A shul's times: this week's, then its usual weekday and Shabbos ones,
  // each from the page (or newsletter) that gives it.
  const shul = jobs.times?.places.find((x) => x.id === id) as ShulPlace | undefined
  if (shul) {
    const live = shul.pages.filter((x) => x.watch.active).map((x) => x.watch)
    const named = partPages(live, [])
    site ??= live[0]?.url ?? null
    const today = isoDay(now)
    const times = shul.times
    const thisWeek = (times?.schedules ?? []).filter((s) => s.kind === 'week' && s.from <= today && s.to >= today)
    if (times && thisWeek.length) {
      const news = (shul.newsletters ?? []).find((w) => w.active && w.pageChangedAt)
      const page = named.get('week')
      const fromNews = !!news && (!page || thisWeek.some((s) => s.postedBy !== 'website'))
      const foot: Foot = fromNews
        ? { lead: 'Same as', links: [{ text: `its newsletter, ${news!.url.replace(/^mailto:/, '')}`, url: null }], when: read(news!.pageChangedAt), mail: true, change: { kind: 'newsletter', replaces: news!.id } }
        : page
          ? { lead: 'Same as', links: [pageLink(page.url)], when: read(page.lastCheck?.at), change: { kind: 'page', job: 'times', replaces: page.id } }
          : { lead: 'Added by hand', links: [], when: thisWeek[0].postedAt ? day(thisWeek[0].postedAt) : null }
      for (const week of scheduleProposal([], thisWeek, times.minyanim).weeks) {
        boxes.push({ key: `week-${week.range}`, kind: 'week', title: `${TIMES_PART_LABELS.week}, ${week.range}`, week, foot })
      }
    }
    for (const part of ['weekday', 'shabbos'] as const) {
      const page = named.get(part)
      const rows = times && page ? usualRows(part, times.minyanim, times.minyanim) : []
      if (page && rows.length) boxes.push({ key: part, kind: 'usual', title: TIMES_PART_LABELS[part], rows, foot: { lead: 'Same as', links: [pageLink(page.url)], when: read(page.lastCheck?.at), change: { kind: 'page', job: 'times', replaces: page.id } } })
    }
    if (!shul.off) {
      pages += live.length
      if (live.length || shul.website) reads.push({ job: 'times', resourceId: id })
    }
    add = { job: 'times', email: true, label: 'A web page, or the email its newsletter comes from' }
  }

  // A mikvah's sections, each from the page that reads it.
  const mikvah = jobs.hours?.places.find((x) => x.id === id) as MikvahPlace | undefined
  if (mikvah) {
    const live = mikvah.pages.filter((x) => x.watch.active).map((x) => x.watch)
    const sections = mikvah.sections ?? []
    const named = sectionPages(live, sections, [])
    site ??= live[0]?.url ?? null
    for (const s of sections) {
      const page = named.get(s.section)
      if (page) boxes.push({ key: s.section, kind: 'section', title: s.label, section: s, foot: { lead: 'Same as', links: [pageLink(page.url)], when: read(page.lastCheck?.at), change: { kind: 'page', job: 'hours', replaces: page.id } } })
    }
    if (!mikvah.off) {
      pages += live.length
      if (live.length || mikvah.website) reads.push({ job: 'hours', resourceId: id })
    }
    add ??= { job: 'hours', email: false, label: 'A web page' }
  }

  // A food place's dishes, from its menu.
  const food = jobs.dishes?.find((x) => x.id === id)
  if (food) {
    const r = food.reading
    const menu = r?.sourceUrl ?? food.menuUrl
    if (food.dishes.length && r?.status !== 'no_menu') {
      const sometimes = new Set(food.sometimes ?? [])
      const sent = sentThroughSite(food)
      boxes.push({
        key: 'dishes',
        kind: 'rows',
        title: 'Dishes',
        groups: [{ head: '', rows: food.dishes.map((name) => ({ name, sub: sometimes.has(name) ? 'Not always' : undefined })) }],
        foot: sent
          ? { lead: 'Sent through the site', links: [], when: food.menuAt ? day(food.menuAt) : null, change: { kind: 'menu' } }
          : { lead: 'Same as', links: [{ text: 'its menu', url: menu ?? null }], when: read(r?.readAt), change: { kind: 'menu' } },
      })
    }
    const live = (food.pages ?? []).filter((w) => w.active)
    site ??= live[0]?.url ?? null
    if (r?.status !== 'no_menu' && (food.menuUrl || food.website)) {
      pages += 1 + live.length
      reads.push({ job: 'dishes', resourceId: id })
    }
    if (!food.menuUrl) add ??= { job: 'dishes', email: false, label: 'Its menu page' }
  }

  // Its hechsher, as the lists it's on have it.
  const kosher = jobs.kosher?.places.find((x) => x.id === id)
  if (kosher?.on.length) {
    const lists = jobs.kosher!.lists
    const on = [...new Set(kosher.on.map((o) => o.list))]
    const states = on.map((l) => lists.find((s) => s.list === l))
    const at = states.map((s) => s?.watch?.lastOkAt).filter((x): x is string => !!x).sort()[0]
    boxes.push({
      key: 'kosher',
      kind: 'rows',
      title: 'Kosher',
      groups: [{ head: '', rows: [{ name: 'Hechsher', right: kosher.certs.join(', ') || kosher.on[0].says }] }],
      foot: { lead: 'Same as', links: on.map((l, i) => ({ text: l === 'keystone' ? 'Keystone-K’s list' : 'Mekor Habracha’s list', url: states[i]?.url ?? null })), when: read(at) },
    })
  }

  // A hospital's boxes of contacts, from Refuah.
  const hospital = jobs.hospitals?.find((x) => x.id === id)
  if (hospital?.watch) {
    const w = hospital.watch
    for (const b of hospital.boxes ?? []) {
      boxes.push({ key: `refuah-${b.title}`, kind: 'people', title: b.title, box: b, foot: { lead: 'Same as', links: [{ text: 'Refuah', url: w.url }], when: read(w.lastCheck?.at ?? w.lastOkAt), change: { kind: 'refuah' } } })
    }
    if (w.active) {
      pages += 1
      reads.push({ job: 'refuah', watchId: w.id })
    }
  }

  // An eruv's status, from its status page or its emails.
  const eruv = jobs.eruvim?.eruvim.find((x) => x.id === id)
  if (eruv) {
    const pill = statusPill(eruv, new Date(now), jobs.eruvim!.timezone)
    const foot: Foot = eruv.statusUrl
      ? { lead: 'Same as', links: [{ text: 'its status page', url: eruv.statusUrl }], when: read(eruv.statusCheckedAt) }
      : { lead: 'Same as', links: [{ text: `its emails, from ${eruv.statusEmail ?? ''}`, url: null }], when: read(eruv.statusCheckedAt), mail: true }
    boxes.push({ key: 'eruv', kind: 'rows', title: 'Status', groups: [{ head: '', rows: [{ name: 'Status', right: pill.text, sub: eruv.statusWords ?? undefined }] }], foot })
    if (eruv.statusUrl) {
      pages += 1
      reads.push({ job: 'eruv', id })
    }
  }

  // Its name and contact: Google's, then its website's, then a person's.
  const google = jobs.google?.places.find((x) => x.id === id)
  if (google) {
    const by = (kind: string) => google.fields.filter((f) => f.by.kind === kind)
    const g = google.matched ? by('google') : []
    if (g.length) boxes.push({ key: 'google', kind: 'rows', title: fieldsTitle(g), groups: [{ head: '', rows: fieldRows(g) }], foot: { lead: 'Same as', links: [{ text: 'its Google listing', url: null }], when: read(google.readAt) } })
    const web = by('website')
    const webAt = web.map((f) => f.by.at).filter((x): x is string => !!x).sort().at(-1)
    if (web.length) boxes.push({ key: 'website', kind: 'rows', title: g.length ? 'From its website' : fieldsTitle(web), groups: [{ head: '', rows: fieldRows(web) }], foot: { lead: 'Same as', links: [site ? pageLink(site) : { text: 'its website', url: null }], when: read(webAt) } })
    const you = by('you')
    const youAt = you.map((f) => f.by.at).filter((x): x is string => !!x).sort().at(-1)
    if (you.length) boxes.push({ key: 'you', kind: 'rows', title: g.length || web.length ? 'Checked by a person' : fieldsTitle(you), groups: [{ head: '', rows: fieldRows(you) }], foot: { lead: 'Checked by a person', links: [], when: youAt ? day(youAt) : null } })
  }

  return { boxes, reads, pages, add }
}
