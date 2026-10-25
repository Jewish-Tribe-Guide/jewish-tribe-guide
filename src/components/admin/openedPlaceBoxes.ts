import { scheduleProposal, type ProposalRow, type WeekProposal } from '@/lib/timesProposal'
import { TIMES_PART_LABELS } from '@/lib/timesParts'
import { eruvStanding, findingFor, statusPill, websiteWatchOf } from '@/lib/eruvJob'
import { dishJobStatus, didntLoad, eruvSection, hospitalSection, sentThroughSite } from '@/lib/watchJobs'
import { hoursDidntLoad, hoursSection } from '@/lib/hoursJob'
import { formatHoursSummary } from '@/lib/hours'
import { TEFILLAH_LABELS } from '@/lib/davening'
import { watchHealth, type Watch } from '@/lib/watches'
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

/** What Read it now reads, one after another. `watch` is one page a
 *  watch reads (an eruv's website). */
export type ReadStep =
  | { job: 'hours' | 'times'; resourceId: string }
  | { job: 'dishes'; resourceId: string }
  | { job: 'refuah'; watchId: string }
  | { job: 'watch'; watchId: string }
  | { job: 'eruv'; id: string }

/** What Add a source takes: a page, or for a shul a newsletter's email too. */
export type AddSource = { job: 'hours' | 'times' | 'dishes'; email: boolean; label: string }

/** What a problem's own button does: Find it on Google (and Not on
 *  Google), read its page now, give it another page, add one, or, where
 *  only its job page can, a link there. */
export type Fix =
  | { kind: 'google' }
  | { kind: 'read'; step: ReadStep; pages?: number }
  | { kind: 'change'; change: Change; label: string }
  | { kind: 'add' }
  | { kind: 'job'; job: 'google' | 'eruv'; text: string }
export type Field = { label: string; value: string }
/** A place not checked, by what's wrong (FinalFood3): "rivkacakes.com ·
 *  never read · added Oct 23", the fields it leaves unchecked, its fix. */
export type Problem = { key: string; page: FootLink | null; says: string; fields: Field[]; fix: Fix | null }

/** `checked`: the boxes no problem stands for, a not-checked place's
 *  "2 more checked". */
export type Opened = { boxes: OpenedBox[]; reads: ReadStep[]; pages: number; add: AddSource | null; problems: Problem[]; checked: OpenedBox[] }

const read = (at: string | null | undefined) => (at ? `read ${day(at)}` : null)
const pageLink = (url: string): FootLink => ({ text: shortUrl(url), url })
/** "Cakes, Meringue Rolls, Macarons and 7 more". */
export const listText = (items: readonly string[], none = 'None listed') =>
  items.length ? (items.length > 3 ? `${items.slice(0, 3).join(', ')} and ${items.length - 3} more` : items.join(', ')) : none
/** What's wrong with a page, as its line says it; null when it loads. */
export function pageSays(w: Pick<Watch, 'active' | 'lastRunAt' | 'lastOkAt' | 'lastError' | 'failingSince'> & { createdAt?: string }, now: number): string | null {
  const h = watchHealth(w, now)
  if (h.state === 'waiting') return w.createdAt ? `never read · added ${day(w.createdAt)}` : 'never read'
  if (h.state === 'failing') return `failed every night since ${day(h.since)}`
  if (h.state === 'stale') return `not read since ${day(h.lastRunAt)}`
  return null
}
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
  const problems: Problem[] = []
  // Boxes a problem stands for, and pages that don't load.
  const drop = new Set<string>()
  const badPages = new Set<string>()
  // The pages of its website a job reads, and the read that reads each.
  const sitePages: { watch: Watch; step: ReadStep }[] = []
  const problem = (p: Problem) => {
    const same = problems.find((x) => x.key === p.key)
    if (same) same.fields.push(...p.fields.filter((f) => !same.fields.some((g) => g.label === f.label)))
    else problems.push(p)
  }

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
    const fields = [{ label: 'Minyanim', value: listText([...new Set((times?.minyanim ?? []).map((m) => TEFILLAH_LABELS[m.tefillah]))]) }]
    pagesProblems('times', shul, live, fields)
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
    const fields = sections.length ? sections.map((s) => ({ label: s.label, value: (s.hours && formatHoursSummary(s.now[s.hours])) || 'None listed' })) : [{ label: 'Hours', value: 'None listed' }]
    pagesProblems('hours', mikvah, live, fields)
  }

  // A shul's or mikvah's pages that didn't load, or that its times can't be
  // read from; or none at all.
  function pagesProblems(job: 'hours' | 'times', p: ShulPlace | MikvahPlace, live: Watch[], fields: Field[]) {
    const step: ReadStep = { job, resourceId: id }
    for (const w of live) sitePages.push({ watch: w, step })
    const state = { pages: p.pages.map((x) => x.watch), off: p.off, waiting: p.findings?.length, decidedAt: p.decided?.at, newsletters: p.newsletters }
    if (hoursDidntLoad(state, now)) {
      // A site that's down is one group, its pages read together.
      const down = live.filter((x) => didntLoad(x, now))
      down.forEach((w) => badPages.add(w.id))
      const w = down[0]
      if (w) problem({ key: w.id, page: pageLink(w.url), says: `${pageSays(w, now) ?? 'didn’t load'}${down.length > 1 ? ` · ${down.length} pages` : ''}`, fields: [...fields], fix: { kind: 'read', step, pages: down.length } })
    } else if (hoursSection(state, now) === 'cant_read') {
      const w = live[0]
      if (w) badPages.add(w.id)
      const what = job === 'times' ? 'times' : 'hours'
      problem(
        w
          ? { key: w.id, page: pageLink(w.url), says: `its ${what} can’t be read`, fields: [...fields], fix: { kind: 'change', change: { kind: 'page', job, replaces: w.id }, label: `Give the page with its ${what}` } }
          : { key: job, page: null, says: `Nothing gives its ${what}`, fields: [...fields], fix: { kind: 'add' } },
      )
    }
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
    const step: ReadStep = { job: 'dishes', resourceId: id }
    for (const w of live) sitePages.push({ watch: w, step })
    const status = dishJobStatus(food, now)
    const fields = [{ label: 'Dishes', value: listText(food.dishes) }]
    const url = menu ?? food.website
    const page: FootLink | null = url ? pageLink(url) : null
    if (status === 'not_read' || status === 'cant_read' || status === 'didnt_load') drop.add('dishes')
    if (status === 'not_read') problem({ key: 'menu', page, says: 'never read', fields, fix: url ? { kind: 'read', step } : { kind: 'add' } })
    if (status === 'cant_read') problem({ key: 'menu', page, says: 'can’t be read', fields, fix: { kind: 'change', change: { kind: 'menu' }, label: 'Give its menu page' } })
    if (status === 'didnt_load') {
      const w = food.menuWatch
      problem({ key: 'menu', page: w ? pageLink(w.url) : page, says: (w && pageSays(w, now)) ?? 'didn’t load', fields, fix: { kind: 'read', step } })
    }
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
  if (hospital && hospitalSection({ watch: hospital.watch, notOnRefuah: hospital.notOnRefuah, waiting: hospital.findings?.length }, now) === 'cant_read') {
    const w = hospital.watch
    const fields = (hospital.boxes ?? []).map((b) => ({ label: b.title, value: listText(b.labels) }))
    hospital.boxes?.forEach((b) => drop.add(`refuah-${b.title}`))
    problem(
      w && didntLoad(w, now)
        ? { key: 'refuah', page: { text: 'Refuah', url: w.url }, says: pageSays(w, now) ?? 'didn’t load', fields, fix: { kind: 'read', step: { job: 'refuah', watchId: w.id } } }
        : { key: 'refuah', page: null, says: 'Not found on Refuah', fields, fix: { kind: 'change', change: { kind: 'refuah' }, label: 'Give its page on Refuah' } },
    )
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
    const d = jobs.eruvim!
    const watch = websiteWatchOf(eruv, d.watches)
    const standing = eruvStanding(eruv, { finding: findingFor(d.findings, id), watch, now: new Date(now), timezone: d.timezone })
    if (standing.tab === 'cant_read') {
      const status = [{ label: 'Status', value: eruv.status ? pill.text : '—' }]
      const section = eruvSection(eruv)
      const read: Fix = { kind: 'read', step: { job: 'eruv', id } }
      if (section !== 'read') drop.add('eruv')
      if (section === 'no_source') problem({ key: 'eruv', page: null, says: 'Nothing gives its status', fields: status, fix: { kind: 'job', job: 'eruv', text: 'Give it a status page' } })
      else if (section === 'email') problem({ key: 'eruv', page: { text: `its emails, from ${eruv.statusEmail ?? ''}`, url: null }, says: 'its last email couldn’t be read', fields: status, fix: { kind: 'job', job: 'eruv', text: 'Say what it says' } })
      else if (section === 'didnt_load') problem({ key: 'eruv', page: { text: 'its status page', url: eruv.statusUrl }, says: eruv.statusErrorAt ? `didn’t load ${day(eruv.statusErrorAt)}` : 'didn’t load', fields: status, fix: read })
      else if (eruv.lineUrl && eruv.lineError) problem({ key: 'map', page: { text: 'its map', url: eruv.lineUrl }, says: 'didn’t load', fields: [{ label: 'Map', value: 'As last read' }], fix: read })
      else if (watch)
        problem({
          key: watch.id,
          page: pageLink(watch.url),
          says: pageSays(watch, now) ?? 'didn’t load',
          fields: [
            { label: 'Hotline', value: eruv.hotline ?? 'None listed' },
            { label: 'Email alerts', value: eruv.alertsUrl ? shortUrl(eruv.alertsUrl) : 'None listed' },
          ],
          fix: { kind: 'read', step: { job: 'watch', watchId: watch.id } },
        })
    }
  }

  // Its name and contact: Google's, then its website's, then a person's.
  const google = jobs.google?.places.find((x) => x.id === id)
  if (google) {
    const by = (kind: string) => google.fields.filter((f) => f.by.kind === kind)
    const g = google.matched ? by('google') : []
    const asField = (f: GoogleFieldRow): Field => ({ label: f.label, value: f.field === 'website' && f.value !== '—' ? shortUrl(f.value) : f.value === '—' ? 'None listed' : f.value })
    if (google.section === 'cant_read' && google.matched) {
      drop.add('google')
      problem({ key: 'google', page: { text: 'its Google listing', url: null }, says: google.failedAt ? `failed every night since ${day(google.failedAt)}` : 'not read yet', fields: g.map(asField), fix: { kind: 'google' } })
    }
    // A field nothing checks: with a page of its website that would, once
    // it loads; else with Google, the only one that checks a name.
    const nothing = by('nothing')
    const bad = sitePages.find((x) => pageSays(x.watch, now) !== null)
    const byPage = bad ? nothing.filter((f) => f.field !== 'name') : []
    const rest = nothing.filter((f) => !byPage.includes(f))
    if (rest.length) {
      const says = rest.length === 1 ? `Nothing checks its ${rest[0].label.toLowerCase()}` : 'Nothing checks these'
      const fix: Fix = !google.matched ? { kind: 'google' } : add ? { kind: 'add' } : { kind: 'job', job: 'google', text: 'Check it against Google' }
      problem({ key: 'nothing', page: null, says, fields: rest.map(asField), fix })
    }
    if (bad && byPage.length) {
      badPages.add(bad.watch.id)
      problem({ key: bad.watch.id, page: pageLink(bad.watch.url), says: pageSays(bad.watch, now)!, fields: byPage.map(asField), fix: { kind: 'read', step: bad.step } })
    }
    if (g.length) boxes.push({ key: 'google', kind: 'rows', title: fieldsTitle(g), groups: [{ head: '', rows: fieldRows(g) }], foot: { lead: 'Same as', links: [{ text: 'its Google listing', url: null }], when: read(google.readAt) } })
    const web = by('website')
    const webAt = web.map((f) => f.by.at).filter((x): x is string => !!x).sort().at(-1)
    if (web.length) boxes.push({ key: 'website', kind: 'rows', title: g.length ? 'From its website' : fieldsTitle(web), groups: [{ head: '', rows: fieldRows(web) }], foot: { lead: 'Same as', links: [site ? pageLink(site) : { text: 'its website', url: null }], when: read(webAt) } })
    const you = by('you')
    const youAt = you.map((f) => f.by.at).filter((x): x is string => !!x).sort().at(-1)
    if (you.length) boxes.push({ key: 'you', kind: 'rows', title: g.length || web.length ? 'Checked by a person' : fieldsTitle(you), groups: [{ head: '', rows: fieldRows(you) }], foot: { lead: 'Checked by a person', links: [], when: youAt ? day(youAt) : null } })
  }

  const checked = boxes.filter((b) => !drop.has(b.key) && !(b.foot.change?.kind === 'page' && badPages.has(b.foot.change.replaces)))
  // Google's first, as drawn: only it checks a name.
  const first = (p: Problem) => (p.key === 'google' || p.key === 'nothing' ? 0 : 1)
  problems.sort((a, b) => first(a) - first(b))
  return { boxes, reads, pages, add, problems, checked }
}

/** "2 more checked", a line each: what it is, the listing's value, where
 *  it's read from (FinalPhonePlace3). */
export type CheckedLine = { key: string; box: string; label: string; value: string; foot: Foot }
export function checkedLines(boxes: readonly OpenedBox[]): CheckedLine[] {
  return boxes.flatMap((b): CheckedLine[] => {
    const line = (label: string, value: string, n = 0) => ({ key: `${b.key}-${n}`, box: b.key, label, value, foot: b.foot })
    if (b.kind === 'usual') return [line(b.title, listText([...new Set(b.rows.map((r) => r.what.split(' · ')[0]))]))]
    if (b.kind === 'week') return [line(b.title, b.week.none ? 'No minyan' : listText(b.week.days.map((d) => d.label)))]
    if (b.kind === 'section') return [line(b.title, b.section.hours ? formatHoursSummary(b.section.now[b.section.hours]) || '—' : '—')]
    if (b.kind === 'people') return [line(b.title, listText(b.box.labels))]
    // Its menu by its address, as drawn ("rivkacakes.com/?page=menu").
    if (b.key === 'dishes') return [{ ...line('Dishes', listText(b.groups.flatMap((g) => g.rows.map((r) => r.name)))), foot: { ...b.foot, links: b.foot.links.map((l) => (l.url ? pageLink(l.url) : l)) } }]
    return b.groups.flatMap((g) => g.rows).map((r, i) => line(r.name, r.right ?? r.sub ?? '', i))
  })
}
