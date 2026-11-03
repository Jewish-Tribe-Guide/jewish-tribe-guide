import type { DirectoryResource } from '@/types'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import { websiteKeyOf } from '@/lib/googleJob'
import { formatHoursSummary, hasAnyHours } from '@/lib/hours'
import type { EditorRow } from '@/lib/editorRows'
import { isWebsite } from '@/lib/listingView'
import { didntLoad, menuDidntLoad } from '@/lib/watchJobs'
import { linkBroken } from '@/lib/linkCheck'
import type { Watch } from '@/lib/watches'
import { whyNoLoad } from '@/lib/whyNoLoad'
import type { Change, ReadStep, Stop } from './openedPlaceBoxes'
import { troubleSince } from './todoWaiting'
import type { Jobs } from './useWatchJobs'
import { day, shortUrl } from './watchText'

// A broken check on To do, as the boards draw it (R3Site, R2Menu, R6Menu,
// R2Google, O1Women, O2Pizza; the older M4Link, M5Hours and G2Stopped for
// the words of their buttons): the listing's field in a card, where it's
// read from folded under it ("soicherryhill.org and 4 of its pages ·
// didn't load since Oct 22"), and the answers. What each kind is, what the
// card shows and what its answers do is worked out here, from the jobs'
// readings; TodoBroken.tsx draws it and does them.

export type BrokenKind =
  | 'website'
  | 'menu-load'
  | 'menu-read'
  | 'google-missing'
  | 'google-stopped'
  | 'times-read'
  | 'hours-read'
  | 'refuah-load'
  | 'refuah-missing'
  | 'link'
  | 'email'

/** A broken check's kind, from its line (placeTroubles' words, P2Words). */
export function brokenKind(label: string): BrokenKind | null {
  if (label === 'Website didn’t load') return 'website'
  if (label === 'Menu didn’t load') return 'menu-load'
  if (label === 'Menu can’t be read') return 'menu-read'
  if (label === 'Google not found') return 'google-missing'
  if (label.startsWith('Google stopped answering')) return 'google-stopped'
  if (label === 'Times can’t be read') return 'times-read'
  if (label === 'Hours can’t be read') return 'hours-read'
  if (label === 'Refuah didn’t load') return 'refuah-load'
  if (label === 'Not found on Refuah') return 'refuah-missing'
  if (label === 'Link doesn’t open') return 'link'
  if (label.startsWith('Their email came')) return 'email'
  return null
}

/** What an answer does. `give`: the card turns into a box for the page or
 *  address that replaces it (R6Give); `off`: Still right, the place no
 *  longer read and its listing kept as it is. */
export type BrokenAct =
  | { kind: 'read'; steps: ReadStep[] }
  | { kind: 'stop'; stops: Stop[] }
  | { kind: 'off'; job: 'hours' | 'times' }
  | { kind: 'give'; change: Change; label: string }
  | { kind: 'add'; job: 'hours' | 'times'; label: string }
  | { kind: 'find-google' }
  | { kind: 'not-on-google' }
  | { kind: 'not-on-refuah' }
  | { kind: 'check-link'; key: string }
export type BrokenAnswer = { label: string; act: BrokenAct }

/** The folded source card: "soicherryhill.org" and " and 4 of its pages",
 *  then the failure in brown; opened, its link and why in plain words. */
export type BrokenSource = { name: string; rest: string; failed: string | null; url: string | null; why: string | null }

/** Which of the listing's fields the card shows; `google`: Google's own
 *  (R2Google), `none`: no card (an eruv's email). */
export type BrokenField = 'website' | 'items' | 'minyanim' | 'hours' | 'contacts' | 'google' | 'none' | { key: string }

export type BrokenView = { kind: BrokenKind; source: BrokenSource; field: BrokenField; answers: BrokenAnswer[] }

/** The listing editor's rows (editorRows, with splitContact) the card
 *  holds: its website for a website, its dishes for a menu, its usual
 *  times for a shul, its sections or hours for a mikvah, its people for a
 *  hospital, the field a link is in. */
export function brokenRows(field: BrokenField, rows: readonly EditorRow[]): string[] {
  const holds = (pick: (f: CategoryField) => boolean) => rows.filter((r) => r.fields.some(pick)).map((r) => r.id)
  if (field === 'website') return holds(isWebsite).slice(0, 1)
  if (field === 'items') return rows.filter((r) => r.kind === 'items').map((r) => r.id)
  if (field === 'minyanim') return rows.filter((r) => r.kind === 'minyans' && !r.week).map((r) => r.id)
  if (field === 'hours') {
    const sections = rows.filter((r) => r.kind === 'audience').map((r) => r.id)
    return sections.length ? sections : holds((f) => f.type === 'hours')
  }
  if (field === 'contacts') return holds((f) => f.type === 'contacts')
  if (typeof field === 'object') return holds((f) => f.key === field.key).slice(0, 1)
  return []
}

/** R2Google's card: what the listing says for each thing Google would
 *  give it, in the board's order; "Not on the listing" for what it lacks. */
export function googleRows(item: DirectoryResource, category: CategoryConfig): { label: string; value: string | null }[] {
  const d = item as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const site = websiteKeyOf(category)
  const hours = category.detailFields.some((f) => f.key === 'hours' && f.type === 'hours') && hasAnyHours(d.hours) ? formatHoursSummary(d.hours) : null
  return [
    { label: 'Name', value: text(item.name) },
    ...(category.hasAddress !== false ? [{ label: 'Address', value: text(item.address) }] : []),
    ...(category.hasPhone !== false ? [{ label: 'Phone', value: text(item.phone) }] : []),
    ...(site ? [{ label: 'Website', value: text(d[site]) && shortUrl(text(d[site])!) }] : []),
    ...(category.detailFields.some((f) => f.type === 'hours') ? [{ label: 'Hours', value: hours }] : []),
    { label: 'Short Description', value: text(item.googleDescription) },
  ]
}

/** Stop using Google reads the place's own website straight away, which
 *  then keeps what Google kept (notOnGoogle); so with a website on the
 *  listing, it says that. */
export function stoppedGoogleAnswers(view: BrokenView, item: DirectoryResource, category: CategoryConfig): BrokenAnswer[] {
  const site = websiteKeyOf(category)
  const has = !!site && typeof (item as Record<string, unknown>)[site] === 'string' && !!((item as Record<string, unknown>)[site] as string).trim()
  if (view.kind !== 'google-stopped' || !has) return view.answers
  return view.answers.map((a) => (a.act.kind === 'not-on-google' ? { ...a, label: 'Use its website instead' } : a))
}

const since = (iso: string | null) => (iso ? ` since ${day(iso)}` : '')
const host = (url: string) => shortUrl(url).split('/')[0]
const pages = (n: number) => (n > 1 ? ` and ${n - 1} of its pages` : '')

export function brokenView(id: string, label: string, jobs: Jobs, now: number): BrokenView | null {
  const kind = brokenKind(label)
  if (!kind) return null
  const started = troubleSince(id, label, jobs, now)
  const shul = jobs.times?.places.find((p) => p.id === id)
  const mikvah = jobs.hours?.places.find((p) => p.id === id)
  const site = jobs.sites?.find((p) => p.id === id)
  const food = jobs.dishes?.find((p) => p.id === id)

  if (kind === 'website') {
    // Every page of its website that didn't load, by the job that reads it.
    const down = (w: Watch) => w.active && didntLoad(w, now)
    const steps: ReadStep[] = []
    const stops: Stop[] = []
    const urls: { url: string; error: string | null }[] = []
    for (const [job, p] of [['times', shul], ['hours', mikvah]] as const) {
      const bad = (p?.pages ?? []).map((x) => x.watch).filter(down)
      if (!bad.length) continue
      steps.push({ job, resourceId: id })
      for (const w of bad) {
        stops.push({ kind: 'page', job, watchId: w.id, what: shortUrl(w.url) })
        urls.push({ url: w.url, error: w.lastError })
      }
    }
    for (const w of [...(site?.pages ?? []).map((x) => x.watch), ...(food?.pages ?? [])].filter(down)) {
      steps.push({ job: 'watch', watchId: w.id })
      stops.push({ kind: 'watch', watchId: w.id, what: shortUrl(w.url) })
      urls.push({ url: w.url, error: w.lastError })
    }
    const first = urls[0]
    return {
      kind,
      field: 'website',
      source: { name: first ? host(first.url) : 'Its website', rest: pages(urls.length), failed: `didn’t load${since(started)}`, url: first?.url ?? null, why: whyNoLoad(first?.error) },
      answers: [
        { label: 'Read it again', act: { kind: 'read', steps } },
        { label: 'Stop reading it', act: { kind: 'stop', stops } },
      ],
    }
  }

  if (kind === 'menu-load' || kind === 'menu-read') {
    const url = food?.reading?.sourceUrl ?? food?.menuUrl ?? food?.website ?? null
    const w = food && menuDidntLoad(food, now) ? food.menuWatch : null
    const give: BrokenAnswer = { label: 'Give its menu', act: { kind: 'give', change: { kind: 'menu' }, label: 'Its menu' } }
    const none: BrokenAnswer = { label: 'No menu online', act: { kind: 'stop', stops: [{ kind: 'menu', action: 'no_menu', what: 'its menu' }] } }
    return {
      kind,
      field: 'items',
      source: {
        name: url ? shortUrl(url) : 'Its menu',
        rest: '',
        failed: kind === 'menu-load' ? `didn’t load${since(started)}` : 'can’t be read',
        url,
        why: kind === 'menu-load' ? whyNoLoad(w?.lastError) : 'Its menu isn’t words on a page, so it can’t be read',
      },
      answers: kind === 'menu-load' ? [{ label: 'Read it again', act: { kind: 'read', steps: [{ job: 'dishes', resourceId: id }] } }, give, none] : [give, none],
    }
  }

  if (kind === 'google-missing' || kind === 'google-stopped') {
    const g = jobs.google?.places.find((p) => p.id === id)
    return {
      kind,
      field: 'google',
      source: {
        name: 'Google',
        rest: kind === 'google-stopped' && g?.readAt ? ` · last read ${day(g.readAt)}` : '',
        failed: kind === 'google-missing' ? 'not found' : `hasn’t answered${since(started)}`,
        url: null,
        why: kind === 'google-stopped' ? 'It tries again every night' : null,
      },
      answers: [
        { label: 'Find it on Google', act: { kind: 'find-google' } },
        { label: kind === 'google-missing' ? 'Not on Google' : 'Stop using Google', act: { kind: 'not-on-google' } },
      ],
    }
  }

  if (kind === 'times-read' || kind === 'hours-read') {
    const job: 'times' | 'hours' = kind === 'times-read' ? 'times' : 'hours'
    const live = ((job === 'times' ? shul : mikvah)?.pages ?? []).map((p) => p.watch).filter((w) => w.active)
    const first = live[0]
    const field = job === 'times' ? 'minyanim' : 'hours'
    // No page at all (Chabad of the Main Line): nothing to give a better
    // one for, so one is added.
    if (!first)
      return {
        kind,
        field,
        source: { name: 'Nothing', rest: ` reads its ${job}`, failed: null, url: null, why: null },
        answers: [
          { label: 'Add a source', act: { kind: 'add', job, label: `The page with its ${job}` } },
          { label: 'Still right', act: { kind: 'off', job } },
        ],
      }
    return {
      kind,
      field,
      source: { name: shortUrl(first.url), rest: live.length > 1 ? ` and ${live.length - 1} more` : '', failed: 'can’t be read', url: first.url, why: `Its ${job} aren’t on the page as words that can be read` },
      answers: [
        { label: `Give the page with its ${job}`, act: { kind: 'give', change: { kind: 'page', job, replaces: first.id }, label: `The page with its ${job}` } },
        { label: 'Still right', act: { kind: 'off', job } },
      ],
    }
  }

  if (kind === 'refuah-load' || kind === 'refuah-missing') {
    const w = jobs.hospitals?.find((h) => h.id === id)?.watch ?? null
    const give: BrokenAnswer = { label: 'Give its page on Refuah', act: { kind: 'give', change: { kind: 'refuah' }, label: 'Its page on Refuah' } }
    return {
      kind,
      field: 'contacts',
      source: {
        name: 'Refuah',
        rest: '',
        failed: kind === 'refuah-load' ? `didn’t load${since(started)}` : 'not found',
        url: w?.url ?? null,
        why: kind === 'refuah-load' ? whyNoLoad(w?.lastError) : null,
      },
      answers:
        kind === 'refuah-load' && w
          ? [
              { label: 'Read it again', act: { kind: 'read', steps: [{ job: 'refuah', watchId: w.id }] } },
              { label: 'Stop reading it', act: { kind: 'stop', stops: [{ kind: 'refuah', what: 'its Refuah page' }] } },
            ]
          : [give, { label: 'Not on Refuah', act: { kind: 'not-on-refuah' } }],
    }
  }

  if (kind === 'link') {
    const l = (jobs.links ?? []).find((x) => x.resourceId === id && linkBroken(x))
    return {
      kind,
      field: l ? { key: l.key } : 'none',
      source: { name: l ? shortUrl(l.url) : 'Its link', rest: '', failed: `doesn’t open${since(started)}`, url: l?.url ?? null, why: whyNoLoad(l?.error) },
      answers: l ? [{ label: 'Check it again', act: { kind: 'check-link', key: l.key } }] : [],
    }
  }

  // An email gone quiet: a shul's newsletter, or an eruv's status emails.
  const letters = (shul?.newsletters ?? []).filter((w) => w.active)
  const eruv = jobs.eruvim?.eruvim.find((e) => e.id === id)
  const last = letters.map((w) => w.pageChangedAt ?? w.createdAt).sort().at(-1) ?? eruv?.statusCheckedAt ?? null
  const address = letters[0]?.url.replace(/^mailto:/, '') ?? eruv?.statusEmail ?? ''
  const change: Change | null = letters[0] ? { kind: 'newsletter', replaces: letters[0].id } : eruv ? { kind: 'eruv-status', id } : null
  const stops: Stop[] = eruv && !letters.length ? [{ kind: 'eruv-status', id, what: 'its status' }] : letters.map((w) => ({ kind: 'watch', watchId: w.id, what: w.url.replace(/^mailto:/, '') }))
  return {
    kind,
    field: letters.length ? 'minyanim' : 'none',
    source: { name: address || 'Its email', rest: '', failed: last ? `last came ${day(last)}` : 'hasn’t come', url: null, why: null },
    answers: [
      ...(change ? [{ label: 'Give another address', act: { kind: 'give' as const, change, label: 'The address its emails come from' } }] : []),
      { label: 'Stop reading it', act: { kind: 'stop', stops } },
    ],
  }
}
