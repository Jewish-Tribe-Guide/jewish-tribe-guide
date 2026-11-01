import { isCategorySyncEligible, type CategoryConfig } from '@/lib/categories'
import { contactFields } from '@/lib/contactRead'
import { editorRows, rowSummary, type EditorRow, type EditorValues } from '@/lib/editorRows'
import { websiteKeyOf, type CheckedField } from '@/lib/googleJob'
import { itemWording } from '@/lib/itemMarks'
import { KOSHER_JOB_CATEGORIES } from '@/lib/kosherJob'
import { pageReadsFor } from '@/lib/listingPageWatch'
import { HOSPITAL_CATEGORY } from '@/lib/refuahMatch'
import { minyanimForBox } from '@/lib/minyanimBox'
import { timeText } from '@/lib/minyanText'
import { dateText, readSchedules, regularMinyanim, schedulesKey } from '@/lib/schedules'
import { shortUrl } from './watchText'

// ── Add a place: what each row will be read from (boards *11, *13, *14) ──────
// The same rows and words as a saved listing (listingSource.ts), for a place
// that isn't saved yet: a row names its source on the right, opened it says
// where it's read from and the one thing to do about that. Nothing's been
// searched, so a website is "Its website" and not a page. What an admin
// chooses here waits and is saved with the listing (AddPlace.tsx). Pure.

/** The sources a new place can be given: a page for its times or hours, the
 *  email its times come from, its menu, its Refuah page, its Keystone-K page,
 *  and its own website, read for a phone and an email. */
export type AddSlot = 'page' | 'email' | 'menu' | 'refuah' | 'keystone' | 'site'
export type GivenSources = Partial<Record<Exclude<AddSlot, 'site'>, string>>

/** A Read now, in hand or done. */
export type AddRead =
  | { state: 'reading' }
  | { state: 'done' }
  | { state: 'none' }
  | { state: 'failed' }
  /** An email: none has come, the one that came had no times, the Gmail
   *  didn't answer, or there's no Gmail connected to ask. */
  | { state: 'found'; on: string }
  | { state: 'no-email' }
  | { state: 'no-times'; on: string }
  | { state: 'no-answer' }
  | { state: 'no-gmail' }
  /** Refuah has no hospital where this one is. */
  | { state: 'not-found' }

/** What the kept kosher lists say of it: the lists it's on, nothing, or not
 *  asked yet. */
export type KosherLookup = { lists: { name: string; url: string; values: Record<string, unknown> }[]; none: string }

export type AddLine = {
  text: string
  url?: string | null
  when?: string | null
  red?: boolean
  readNow?: AddSlot
  change?: { slot: AddSlot; label: string; placeholder?: string }
  add?: { label: string; slot: AddSlot; words?: string; placeholder?: string }
  googleStop?: CheckedField
  useGoogle?: CheckedField
  findOnGoogle?: boolean
  /** Kosher: fill the row in from the list it's on. */
  useList?: KosherLookup['lists'][number]
  /** No email has come: sign up for them. */
  signUp?: boolean
  /** No Gmail connected: where to connect it. */
  setUpGmail?: boolean
}

export type AddRowSource = { job: string; amber: boolean; lines: AddLine[] }

export type AddState = {
  category: CategoryConfig
  /** What the Google pick filled in, as the draft holds it; null, filled in by hand. */
  picked: Partial<Record<CheckedField, string>> | null
  /** Where it is, for a hospital's Refuah. */
  hasPlace: boolean
  values: EditorValues
  given: GivenSources
  stopped: ReadonlySet<CheckedField>
  reads: Partial<Record<AddSlot, AddRead>>
  kosher?: KosherLookup | null
  /** Filled in by Use it: nothing else needs saying. */
  kosherUsed?: string | null
}

const TIMES_SOURCE = 'A web page, or the email it comes from'
const WHAT: Record<'times' | 'hours' | 'menu', string> = { times: 'minyan times', hours: 'hours', menu: 'dishes' }
const asText = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const placeholderFor = (website: string) => (website ? `${shortUrl(website).split('/')[0]}/…` : undefined)

/** Its value in the draft, as a Google pick is compared with it. */
export function fieldNow(field: CheckedField, category: CategoryConfig, values: EditorValues): string {
  if (field === 'name') return values.name.trim()
  if (field === 'phone') return values.phone.trim()
  if (field === 'website') {
    const key = websiteKeyOf(category)
    return key ? asText(values.details[key]) : ''
  }
  const hours = category.detailFields.find((f) => f.type === 'hours')
  return hours && values.details[hours.key] ? JSON.stringify(values.details[hours.key]) : ''
}

const nothing = (line?: Partial<AddLine>): AddRowSource => ({ job: 'Nothing', amber: true, lines: [{ text: 'Nothing reads this', ...line }] })
const linkCheck: AddRowSource = { job: 'Link check', amber: false, lines: [{ text: 'Link check', when: 'Sunday' }] }

/** Its row's source, for a place being added; null where nothing reads a row
 *  like it (its address, its About, a photo). */
export function addRowSources(s: AddState): (row: EditorRow) => AddRowSource | null {
  const { category, picked, values, given, stopped, reads } = s
  const pageReads = pageReadsFor(category)
  const websiteKey = websiteKeyOf(category)
  const website = websiteKey ? asText(values.details[websiteKey]) : ''

  /** What Google can keep. */
  function kept(field: CheckedField): AddRowSource | null {
    if (!isCategorySyncEligible(category)) return field === 'website' ? linkCheck : null
    const fromGoogle = picked?.[field]
    if (fromGoogle !== undefined) {
      if (stopped.has(field)) return nothing({ useGoogle: field })
      if (fromGoogle === fieldNow(field, category, values)) return { job: 'Google', amber: false, lines: [{ text: 'Google', googleStop: field }] }
      return { job: 'Nothing', amber: true, lines: [{ text: 'Google stops keeping this' }] }
    }
    if (field === 'website') return linkCheck
    return picked ? nothing() : nothing({ findOnGoogle: true })
  }

  /** A page's line, as its read has left it. `where`: "its website", or the page. */
  function pageLines(slot: AddSlot, where: string, what: string, url: string | null, change: AddLine['change']): AddLine[] {
    const read = reads[slot]
    const named = where.startsWith('its ') ? `I${where.slice(1)}` : where
    const idle: AddLine = { text: named, url, readNow: slot, change }
    if (read?.state === 'reading') return [{ text: `Reading ${where}…` }]
    if (read?.state === 'done') return [{ text: named, url, when: 'just now', change }]
    if (read?.state === 'none') return [{ text: `No ${what} on ${where}`, change }]
    if (read?.state === 'failed') return [{ text: `Couldn’t read ${where}`, red: true }, idle]
    return [idle]
  }

  function emailLines(address: string): AddLine[] {
    const change: AddLine['change'] = { slot: 'email', label: TIMES_SOURCE }
    const read = reads.email
    if (read?.state === 'reading') return [{ text: 'Looking in the guide’s Gmail…' }]
    if (read?.state === 'found') return [{ text: address, when: read.on, change }]
    if (read?.state === 'no-email') return [{ text: `No emails from ${address} yet`, change, signUp: true }]
    if (read?.state === 'no-times') return [{ text: `${address}’s ${read.on} email had no times`, change }]
    if (read?.state === 'no-answer') return [{ text: 'Couldn’t reach the guide’s Gmail', red: true }, { text: address, when: 'within the hour', change }]
    if (read?.state === 'no-gmail') return [{ text: address, change, setUpGmail: true }]
    return [{ text: address, readNow: 'email', change }]
  }

  function pagesRow(kind: 'times' | 'hours', withAdd: boolean): AddRowSource {
    const label = kind === 'times' ? TIMES_SOURCE : 'A web page'
    const placeholder = placeholderFor(website)
    const page = given.page
    const email = kind === 'times' ? given.email : undefined
    const where = page ? shortUrl(page) : website ? 'its website' : null
    if (!where && !email) return nothing({ add: { label, slot: 'page', placeholder } })
    const lines: AddLine[] = [
      ...(email ? emailLines(email) : []),
      ...(where ? pageLines('page', where, WHAT[kind], page ?? (website || null), { slot: 'page', label, placeholder }) : []),
    ]
    if (withAdd && !(where && email)) lines.push({ text: '', add: { label, slot: 'page', placeholder } })
    return { job: where && email ? 'Website, Email' : email ? 'Email' : 'Website', amber: false, lines }
  }

  function menuRow(): AddRowSource {
    const label = 'Its menu page'
    const placeholder = placeholderFor(website)
    const where = given.menu ? shortUrl(given.menu) : website ? 'its website' : null
    if (!where) return nothing({ add: { label, slot: 'menu', placeholder } })
    return { job: 'Website', amber: false, lines: pageLines('menu', where, WHAT.menu, given.menu ?? website, { slot: 'menu', label, placeholder }) }
  }

  function refuahRow(): AddRowSource {
    const label = 'Where it is on Refuah'
    const read = reads.refuah
    if (read?.state === 'not-found') return { job: 'Nothing', amber: true, lines: [{ text: 'Not found on Refuah', add: { label, slot: 'refuah', words: 'Add its page' } }] }
    if (!given.refuah && !s.hasPlace) return nothing({ add: { label, slot: 'refuah' } })
    const change = { slot: 'refuah' as const, label }
    if (read?.state === 'reading') return { job: 'Refuah', amber: false, lines: [{ text: 'Reading Refuah…' }] }
    if (read?.state === 'done') return { job: 'Refuah', amber: false, lines: [{ text: 'Refuah', when: 'just now', change }] }
    if (read?.state === 'failed') return { job: 'Refuah', amber: false, lines: [{ text: 'Couldn’t read Refuah', red: true }, { text: 'Refuah', readNow: 'refuah', change }] }
    return { job: 'Refuah', amber: false, lines: [{ text: 'Refuah', readNow: 'refuah', change }] }
  }

  function kosherRow(): AddRowSource {
    const label = 'Where it is on Keystone-K’s list'
    if (s.kosherUsed) return { job: s.kosherUsed.replace(/’s list$/, ''), amber: false, lines: [{ text: s.kosherUsed, when: 'today', change: { slot: 'keystone', label } }] }
    if (given.keystone) return { job: 'Keystone-K', amber: false, lines: [{ text: shortUrl(given.keystone), change: { slot: 'keystone', label } }] }
    const on = s.kosher?.lists[0]
    if (on) return { job: 'Nothing', amber: true, lines: [{ text: `On ${on.name}`, useList: on }] }
    if (s.kosher) return { job: 'Nothing', amber: true, lines: [{ text: s.kosher.none, add: { label, slot: 'keystone', words: 'Add its page' } }] }
    return nothing()
  }

  const contact = contactFields(category, {})
  return (row) => {
    if (row.kind === 'name') return kept('name')
    if (row.kind === 'minyans') return pagesRow('times', row.id !== 'minyans:next_week')
    if (row.kind === 'audience') return pagesRow('hours', false)
    if (row.kind === 'items') return itemWording(row.fields[0]).noun === 'dish' ? menuRow() : null
    if (row.kind === 'contact') return row.part === 'phone' ? kept('phone') : null
    if (row.fields.some((f) => f.key === 'kosherCert')) return KOSHER_JOB_CATEGORIES.includes(category.id) ? kosherRow() : null
    if (row.fields.some((f) => f.type === 'contacts')) return category.id === HOSPITAL_CATEGORY ? refuahRow() : null
    if (row.fields.some((f) => f.type === 'hours')) return pageReads?.kind === 'hours' ? pagesRow('hours', false) : kept('hours')
    if (row.fields.length !== 1) return null
    const f = row.fields[0]
    if (f.key === websiteKey) return kept('website')
    if (contact.some((c) => c.key === f.key)) {
      if (given.page || website) {
        const slot: AddSlot = pageReads ? 'page' : 'site'
        const where = given.page ? shortUrl(given.page) : 'its website'
        const change = pageReads ? { slot, label: pageReads.kind === 'times' ? TIMES_SOURCE : 'A web page', placeholder: placeholderFor(website) } : undefined
        return { job: 'Website', amber: false, lines: pageLines(slot, where, 'details', given.page ?? website, change) }
      }
      return nothing(pageReads ? { add: { label: pageReads.kind === 'times' ? TIMES_SOURCE : 'A web page', slot: 'page' } } : undefined)
    }
    return f.type === 'url' ? linkCheck : null
  }
}

/** "Usual weekday times: 9 times", a line for each row what was found would
 *  fill or change on a place just added (AddFound13). */
export function foundLines(category: CategoryConfig, listing: Record<string, unknown>, found: readonly { payload: unknown }[], today: string): string[] {
  const before: EditorValues = { name: String(listing.name ?? ''), address: String(listing.address ?? ''), phone: String(listing.phone ?? ''), details: listing }
  const merged = found.reduce<EditorValues>((v, f) => {
    const p = f.payload as { phone?: unknown; details?: Record<string, unknown> } | null
    return { ...v, phone: typeof p?.phone === 'string' ? p.phone : v.phone, details: { ...v.details, ...p?.details } }
  }, before)
  const lines: string[] = []
  for (const row of editorRows(category, merged.details, { splitContact: true })) {
    if (row.kind === 'name') continue
    const now = rowSummary(row, merged, timeText)
    if (!now || now === rowSummary(row, before, timeText)) continue
    if (row.kind === 'minyans') {
      const n = minyanimForBox(regularMinyanim(merged.details[row.fields[0].key]), row.box!).length
      lines.push(`${row.title}: ${n} ${n === 1 ? 'time' : 'times'}`)
    } else lines.push(`${row.title}: ${now}`)
  }
  const minyanim = category.detailFields.find((f) => f.type === 'minyanim')
  if (minyanim) {
    const was = new Set(readSchedules(before.details[schedulesKey(minyanim.key)]).map((s) => s.id))
    for (const s of readSchedules(merged.details[schedulesKey(minyanim.key)])) {
      if (s.kind !== 'week' || was.has(s.id)) continue
      const dates = `${dateText(s.from)} – ${dateText(s.to)}`
      lines.push(s.from <= today && today <= s.to ? `This week’s schedule: ${dates}` : `Schedule: ${dates}`)
    }
  }
  return lines
}
