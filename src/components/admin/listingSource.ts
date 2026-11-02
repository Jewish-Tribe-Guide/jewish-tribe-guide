import type { CategoryConfig } from '@/lib/categories'
import type { EditorRow } from '@/lib/editorRows'
import { contactFields } from '@/lib/contactRead'
import type { CheckedField } from '@/lib/googleJob'
import { websiteKeyOf } from '@/lib/googleJob'
import { itemWording } from '@/lib/itemMarks'
import type { NightKindId } from '@/lib/jobRuns'
import { KOSHER_JOB_CATEGORIES } from '@/lib/kosherJob'
import { jobPageReads } from '@/lib/listingPageWatch'
import { keepsMenuLink } from '@/lib/menuLink'
import { HOSPITAL_CATEGORY } from '@/lib/refuahMatch'
import type { AddSource, Again, Change, Foot, Opened, ReadStep, Stop } from './openedPlaceBoxes'
import { openedPlace } from './openedPlaceBoxes'
import { websiteWatchOf } from '@/lib/eruvJob'
import type { Finding } from '@/lib/watchFindings'
import type { Jobs } from './useWatchJobs'
import { day, shortUrl } from './watchText'

// ── What keeps each row of a listing (boards Listing10, TwoSources10, Nov 1) ─
// A row of the Places listing names, on its right, the source that keeps it:
// Google, Website, Email, Keystone-K, Refuah, Link check; Stopped or Nothing
// in amber. The jobs stay behind them, on Watches. Opened, one line says where
// it's read from, with the one thing that can be done about it: "Its menu ·
// Oct 20 · Change". A week with both gets one line each. Put together from openedPlace's boxes and each
// job's places, so the listing and the job pages say the same. PlaceListing
// draws it. Pure.

/** Read now on a saved place's line (SavedRead15, Nov 1): one of its job's
 *  reads, filed as the nightly run would, or its latest email. Named for what
 *  the line says while it reads, or that it couldn't. */
export type ReadNow = { what: string } & ({ step: ReadStep } | { email: string })

/** A page given where nothing was read: a job's own, or a Change's. */
export type GiveSource = { label: string; email: boolean; run: AddSource | Change }

export type SourceLine = {
  text: string
  url?: string | null
  when?: string | null
  mail?: boolean
  /** The Change screen: its address filled in, Save, Stop reading it. */
  change?: { label: string; value: string; act: Change; stop?: Stop }
  /** The same screen, once stopped: one Start reading, which reads at once. */
  start?: { label: string; value: string; again: Again }
  add?: GiveSource
  /** A field Google keeps, and one it could. */
  googleStop?: CheckedField
  useGoogle?: CheckedField
  read?: ReadNow
}

export type RowSource = { job: string; amber: boolean; line: SourceLine; also?: SourceLine }

/** What a row calls the source behind a job. A kosher list goes by its own
 *  name, from its line. */
const SOURCE_NAMES: Record<NightKindId, string> = {
  google: 'Google',
  kosher: 'Kosher list',
  hospitals: 'Refuah',
  eruvs: 'Website',
  times: 'Website',
  newsletters: 'Email',
  hours: 'Website',
  sites: 'Website',
  menus: 'Website',
  other: 'Website',
  links: 'Link check',
}
const nameOf = (id: NightKindId) => SOURCE_NAMES[id]

const WHERE: Record<Change['kind'], string> = {
  page: 'Where it’s read from',
  newsletter: 'The email its newsletter comes from',
  menu: 'Where its menu is',
  refuah: 'Where it is on Refuah',
  'eruv-status': 'Where its status is',
  'eruv-map': 'Where its map is',
  'eruv-website': 'Where its website is',
  keystone: 'Where it is on Keystone-K’s list',
}

const capital = (s: string) => (s.startsWith('its ') ? `I${s.slice(1)}` : s)
/** "read Oct 20" is "Oct 20" on a line that says what read it. */
const dateOnly = (when: string | null) => when?.replace(/^(read|checked) /, '') ?? null

const nothing = (add?: GiveSource | null, extra?: Partial<SourceLine>): RowSource => ({
  job: 'Nothing',
  amber: true,
  line: { text: 'Nothing reads this', ...(add ? { add } : {}), ...extra },
})

function fromFoot(id: NightKindId, foot: Foot, value: string): RowSource {
  const link = foot.links[0]
  // "Its newsletter", not the address it's from, which Change shows.
  const text = (link ? capital(link.text.split(',')[0]) : foot.lead).replace(/\bnewsletter\b/, 'email')
  return {
    job: foot.mail ? 'Email' : id === 'kosher' ? text.replace(/’s list$/, '') : nameOf(id),
    amber: false,
    line: {
      text,
      url: link?.url ?? null,
      when: dateOnly(foot.when),
      ...(foot.mail ? { mail: true } : {}),
      ...(foot.change ? { change: { label: WHERE[foot.change.kind], value, act: foot.change, ...(foot.stop ? { stop: foot.stop } : {}) } } : {}),
    },
  }
}

function stopped(label: string, value: string, again: Again): RowSource {
  return { job: 'Stopped', amber: true, line: { text: 'Stopped', start: { label, value, again } } }
}

type Listing = Record<string, unknown> & { id: string; phone?: string | null }

/** Each row's job and line, for one place. Null: nothing reads a row like it
 *  (its address, its About, a photo). */
export function listingSources(id: string, jobs: Jobs, now: number, category: CategoryConfig, listing: Listing, given?: Opened): (row: EditorRow) => RowSource | null {
  const opened = given ?? openedPlace(id, jobs, now)
  const off = (kind: NightKindId) => !!jobs.runs?.off?.includes(kind)
  const box = (key: string) => opened.boxes.find((b) => b.key === key)
  const reads = jobPageReads(category)
  const addPage: GiveSource | null = opened.add
    ? { label: opened.add.label, email: opened.add.email, run: opened.add }
    : reads
      ? { label: 'A web page', email: false, run: { job: reads.kind, email: false, label: 'A web page' } }
      : null
  // Its own website's first page a job reads: phones and emails are read
  // off every one.
  const own = [
    ...(off('times') ? [] : (jobs.times?.places.find((p) => p.id === id)?.pages ?? [])),
    ...(off('hours') ? [] : (jobs.hours?.places.find((p) => p.id === id)?.pages ?? [])),
    ...(off('sites') ? [] : (jobs.sites?.find((p) => p.id === id)?.pages ?? [])),
    ...(off('sites') ? [] : (jobs.dishes?.find((p) => p.id === id)?.pages ?? []).map((watch) => ({ watch }))),
  ]
    .map((p) => p.watch)
    .find((w) => w.active)
  const website = (at?: string | null): RowSource => ({ job: nameOf('sites'), amber: false, line: { text: 'Its website', url: own?.url ?? null, when: (at ?? own?.lastOkAt) ? day((at ?? own?.lastOkAt)!) : null } })

  /** A shul's or mikvah's row: the box the page gives, else a page it has,
   *  else stopped, else nothing. */
  function pagesRow(job: 'times' | 'hours', key: string | null): RowSource {
    if (off(job)) return nothing()
    const place = jobs[job]?.places.find((p) => p.id === id)
    // Turned off, its pages are still there and aren't being read.
    const turnedOff = place?.off ? opened.again.find((a) => a.kind === 'place' && a.job === job) : undefined
    if (turnedOff) return stopped(WHERE.page, place?.pages[0]?.watch.url ?? place?.website ?? '', turnedOff)
    const found = key ? box(key) : undefined
    if (found) return fromFoot(job, found.foot, found.foot.links[0]?.url ?? '')
    const live = place?.pages.find((p) => p.watch.active)?.watch
    if (live && !place?.off) {
      return {
        job: nameOf(job),
        amber: false,
        line: {
          text: shortUrl(live.url),
          url: live.url,
          when: live.lastOkAt ? day(live.lastOkAt) : null,
          change: { label: WHERE.page, value: live.url, act: { kind: 'page', job, replaces: live.id }, stop: { kind: 'page', job, watchId: live.id, what: shortUrl(live.url) } },
        },
      }
    }
    const again = opened.again.find((a) => a.kind === 'page' && a.job === job)
    if (again?.kind === 'page') return stopped(WHERE.page, place?.stopped?.find((p) => p.watch.id === again.watchId)?.watch.url ?? '', again)
    return nothing(addPage)
  }

  /** A week's times: the newsletter that gave them, or the page; by hand,
   *  nothing reads them. */
  function oneWeekSource(useBox: boolean): RowSource {
    const shul = jobs.times?.places.find((p) => p.id === id)
    const news = off('newsletters') ? undefined : shul?.newsletters?.find((w) => w.active)
    const value = news?.url.replace(/^mailto:/, '') ?? ''
    const found = useBox ? opened.boxes.find((b) => b.key.startsWith('week-')) : undefined
    if (found?.foot.mail) return fromFoot('newsletters', found.foot, value)
    if (found?.foot.links.length) return pagesRow('times', found.key)
    if (found) return nothing(addPage)
    if (news) {
      return {
        job: nameOf('newsletters'),
        amber: false,
        line: { text: 'Its email', mail: true, when: news.pageChangedAt ? day(news.pageChangedAt) : null, change: { label: WHERE.newsletter, value, act: { kind: 'newsletter', replaces: news.id } } },
      }
    }
    return pagesRow('times', null)
  }

  /** A week read from both: Email first, one line each inside. */
  function weekRow(useBox: boolean): RowSource {
    const one = oneWeekSource(useBox)
    const news = off('newsletters') ? undefined : jobs.times?.places.find((p) => p.id === id)?.newsletters?.find((w) => w.active)
    const page = pagesRow('times', null)
    if (!news || page.job !== 'Website') return one
    const mail = one.job === 'Email' ? one : oneWeekSource(false)
    if (mail.job !== 'Email') {
      return { job: 'Website, Email', amber: false, line: { text: 'Its email', mail: true, when: news.pageChangedAt ? day(news.pageChangedAt) : null, change: { label: WHERE.newsletter, value: news.url.replace(/^mailto:/, ''), act: { kind: 'newsletter', replaces: news.id } } }, also: page.line }
    }
    return { job: 'Website, Email', amber: false, line: mail.line, also: page.line }
  }

  function dishesRow(): RowSource {
    if (off('menus')) return nothing()
    const food = jobs.dishes?.find((p) => p.id === id)
    const found = box('dishes')
    const menu = food?.reading?.sourceUrl ?? food?.menuUrl ?? ''
    const again = opened.again.find((a) => a.kind === 'menu')
    if (again) return stopped(WHERE.menu, menu, again)
    if (found) return fromFoot('menus', found.foot, found.foot.links[0]?.url ?? menu)
    if (menu) {
      return {
        job: nameOf('menus'),
        amber: false,
        line: { text: 'Its menu', url: menu, when: food?.reading?.readAt ? day(food.reading.readAt) : null, change: { label: WHERE.menu, value: menu, act: { kind: 'menu' }, stop: { kind: 'menu', action: 'unlink', what: 'its menu' } } },
      }
    }
    return nothing(keepsMenuLink(category) ? { label: 'Its menu page', email: false, run: { job: 'dishes', email: false, label: 'Its menu page' } } : null)
  }

  function kosherRow(): RowSource | null {
    if (!KOSHER_JOB_CATEGORIES.includes(category.id)) return null
    if (off('kosher')) return nothing()
    const found = box('kosher')
    const give: GiveSource = { label: WHERE.keystone, email: false, run: { kind: 'keystone' } }
    if (!found || !found.foot.links.length) return nothing(give)
    return fromFoot('kosher', found.foot, found.foot.links[0]?.url ?? '')
  }

  function hospitalRow(row: EditorRow): RowSource {
    if (off('hospitals')) return nothing()
    const hospital = jobs.hospitals?.find((p) => p.id === id)
    const again = opened.again.find((a) => a.kind === 'refuah')
    if (again) return stopped(WHERE.refuah, hospital?.watch?.url ?? '', again)
    const found = box(`refuah-${row.title}`) ?? opened.boxes.find((b) => b.key.startsWith('refuah-'))
    if (found) return fromFoot('hospitals', found.foot, found.foot.links[0]?.url ?? '')
    return nothing({ label: WHERE.refuah, email: false, run: { kind: 'refuah' } })
  }

  /** What Google, the website or the link check keep. */
  function keptField(field: CheckedField): RowSource {
    const place = jobs.google?.places.find((p) => p.id === id)
    const row = place?.fields.find((f) => f.field === field)
    const kind = row?.by.kind
    if (kind === 'google' && !off('google')) {
      return { job: nameOf('google'), amber: false, line: { text: 'Google', when: place?.readAt ? day(place.readAt) : null, googleStop: field } }
    }
    if ((kind === 'website' || kind === 'google') && own) return website(row?.by.at)
    if (kind === 'links' && !off('links')) return { job: nameOf('links'), amber: false, line: { text: 'Link check', when: row?.by.at ? day(row.by.at) : null } }
    if (!place && field !== 'name' && own) return website()
    if (!place && field === 'website' && !off('links')) {
      const key = websiteKeyOf(category)
      const link = jobs.links?.find((l) => l.resourceId === id && l.key === key)
      if (link) return { job: nameOf('links'), amber: false, line: { text: 'Link check', when: link.checkedAt ? day(link.checkedAt) : null } }
    }
    return nothing(field === 'name' ? null : addPage, place?.matched ? { useGoogle: field } : undefined)
  }

  /** What Read now reads, for a line that has a source to read. Google's and
   *  the link check's have none: they're not read place by place. */
  function readFor(row: EditorRow, source: RowSource, line: SourceLine): ReadNow | undefined {
    if (['Nothing', 'Stopped', 'Google', 'Link check'].includes(source.job) || line.text === 'Google' || line.text === 'Link check') return undefined
    if (line.mail) return line.change?.value ? { what: 'its email', email: line.change.value } : undefined
    if (row.kind === 'items') return { what: 'its menu', step: { job: 'dishes', resourceId: id } }
    if (row.kind === 'minyans') return { what: 'its website', step: { job: 'times', resourceId: id } }
    if (row.kind === 'audience' || (reads?.kind === 'hours' && row.fields.some((f) => f.type === 'hours'))) return { what: 'its website', step: { job: 'hours', resourceId: id } }
    if (source.job === nameOf('hospitals')) {
      const step = opened.reads.find((r) => r.job === 'refuah')
      return step && { what: 'Refuah', step }
    }
    if (row.fields.some((f) => f.key === 'kosherCert')) {
      const step = opened.reads.find((r) => r.job === 'watch')
      return step && { what: line.text, step }
    }
    return own ? { what: 'its website', step: { job: 'watch', watchId: own.id } } : undefined
  }

  function rowOf(row: EditorRow): RowSource | null {
    if (row.kind === 'name') {
      const place = jobs.google?.places.find((p) => p.id === id)
      return place?.matched ? keptField('name') : null
    }
    if (row.kind === 'minyans') return row.id === 'minyans:this_week' ? weekRow(true) : row.id === 'minyans:next_week' ? weekRow(false) : pagesRow('times', row.box ?? null)
    if (row.kind === 'audience') return pagesRow('hours', row.flag ?? null)
    if (row.kind === 'items') return itemWording(row.fields[0]).noun === 'dish' ? dishesRow() : null
    if (row.kind === 'contact') return row.part === 'phone' ? keptField('phone') : null
    if (row.fields.some((f) => f.key === 'kosherCert')) return kosherRow()
    if (row.fields.some((f) => f.type === 'contacts')) return category.id === HOSPITAL_CATEGORY ? hospitalRow(row) : null
    if (row.fields.some((f) => f.type === 'hours')) return reads?.kind === 'hours' ? pagesRow('hours', null) : keptField('hours')
    if (row.fields.length !== 1) return null
    const f = row.fields[0]
    if (f.key === websiteKeyOf(category)) return keptField('website')
    const contact = contactFields(category, listing).find((c) => c.key === f.key)
    if (contact) return own ? website() : nothing(addPage)
    if (f.type !== 'url') return null
    if (off('links')) return nothing()
    const link = jobs.links?.find((l) => l.resourceId === id && l.key === f.key)
    return link ? { job: nameOf('links'), amber: false, line: { text: 'Link check', when: link.checkedAt ? day(link.checkedAt) : null } } : nothing()
  }

  return (row) => {
    const source = rowOf(row)
    if (!source) return null
    const line = { ...source.line, read: readFor(row, source, source.line) }
    return { ...source, line, ...(source.also ? { also: { ...source.also, read: readFor(row, source, source.also) } } : {}) }
  }
}

/** What's waiting on a row: the finding a read filed for one of its fields,
 *  still in To do until it's answered (ReadWaiting16). */
export function rowFinding(id: string, jobs: Jobs, row: EditorRow): { id: string; from: string } | null {
  const findings: Finding[] = [
    ...(jobs.times?.places.find((p) => p.id === id)?.findings ?? []),
    ...(jobs.hours?.places.find((p) => p.id === id)?.findings ?? []),
    ...(jobs.sites?.find((p) => p.id === id)?.findings ?? []),
    ...((jobs.dishes?.find((p) => p.id === id)?.findings ?? []) as Finding[]),
    ...(jobs.hospitals?.find((p) => p.id === id)?.findings ?? []),
  ]
  const keys = new Set(row.fields.flatMap((f) => [f.key, `${f.key}_schedules`]))
  if (row.kind === 'contact' && row.part) keys.add(row.part)
  if (row.kind === 'name') keys.add('name')
  const found = findings.find((f) => (row.kind === 'audience' && f.section === row.flag) || f.lines.some((l) => keys.has(l.key)))
  return found ? { id: found.id, from: capital(found.from) } : null
}

/** An eruv's rows (EruvListing6): every one is the Eruvs job's, but its
 *  Website, which nothing reads. */
export function eruvSources(id: string, jobs: Jobs, now: number): { status: RowSource; map: RowSource; details: RowSource; website: RowSource } {
  const opened = openedPlace(id, jobs, now)
  const eruv = jobs.eruvim?.eruvim.find((e) => e.id === id)
  const off = !!jobs.runs?.off?.includes('eruvs')
  const box = (key: string) => opened.boxes.find((b) => b.key === key)
  const website = nothing()
  if (!eruv || off) return { status: nothing(), map: nothing(), details: nothing(), website }

  const status = box('eruv')
  const map = box('eruv-map')
  const watch = websiteWatchOf(eruv, jobs.eruvim!.watches)
  const again = opened.again.find((a) => a.kind === 'watch' && a.watchId === watch?.id)
  const add = (label: string, run: Change | AddSource): GiveSource => ({ label, email: 'job' in run && 'email' in run && run.email, run })
  return {
    status: status ? fromFoot('eruvs', status.foot, eruv.statusUrl ?? eruv.statusEmail ?? '') : nothing(add(opened.add?.label ?? WHERE['eruv-status'], { kind: 'eruv-status', id })),
    map: map ? fromFoot('eruvs', map.foot, eruv.lineUrl ?? '') : nothing(add(WHERE['eruv-map'], { kind: 'eruv-map', id })),
    details: !eruv.website
      ? nothing()
      : again
        ? stopped(WHERE['eruv-website'], eruv.website, again)
        : {
            job: nameOf('eruvs'),
            amber: false,
            line: {
              text: 'Its website',
              url: eruv.website,
              when: watch?.lastOkAt ? day(watch.lastOkAt) : null,
              change: { label: WHERE['eruv-website'], value: eruv.website, act: { kind: 'eruv-website', id }, ...(watch?.active ? { stop: { kind: 'watch' as const, watchId: watch.id, what: 'its website' } } : {}) },
            },
          },
    website,
  }
}
