import type { Finding } from './watchFindings'
import type { StatusChange } from './email'
import { readWeekLines } from './scheduleUpdate'
import { TIMES_PART_LABELS } from './timesParts'
import type { SpecialSchedule } from './schedules'
import { LISTING_PAGE_WATCH_NAME } from './listingPageWatch'
import { NEWSLETTER_WATCH_NAME } from './newsletter'
import { KEYSTONE_WATCH_NAME } from './keystoneWatch'
import { MEKOR_WATCH_NAME } from './mekorWatch'
import { REFUAH_WATCH_NAME } from './refuahWatch'
import { GOOGLE_SUBMITTER_NAME } from './activity'
import { ERUV_WEBSITE_WATCH_NAME } from './eruvWebsite'

// ── The nightly email to the admins (Nov 12 2026) ───────────────────────────
// One email per community a night, after the last job, in place of one
// from every watch and job (canvas S7uB4KuZQtdF6bJywzUZBd, boards N7-N9):
// a sentence on what the night found, put together here from the counts
// and never by the AI, then what waits on To do a row a place, what
// stopped working, and what Google changed on its own. The details (the
// times, the old values, the quote) stay in To do. None on a night with
// nothing at all. Pure: nightlyEmailRun.ts gathers the night and sends it.

/** What kind of change a row is, for the sentence at the top. */
export type ChangeKind = 'times' | 'kosher' | 'hours' | 'menu' | 'new' | 'closed' | 'eruv' | 'other'

/** One place waiting on To do: its name, what changed ("This week’s
 *  times, 1 change"), and where it was read ("From their website"). */
export type WaitingRow = { placeId: string | null; name: string; what: string; from: string; kind: ChangeKind; path: string }

/** What stopped working last night, and where it is in Watches. */
type StoppedKind = 'website' | 'newsletter' | 'list' | 'job'
export type StoppedRow = { name: string; why: string; kind: StoppedKind; path: string }

export type Night = {
  community: { slug: string; name: string; shortName: string }
  timezone: string
  /** When it's sent: the night is the evening before. */
  at: Date
  waiting: WaitingRow[]
  /** Still on To do from earlier nights, and from people. */
  earlier: number
  people: number
  stopped: StoppedRow[]
  google: StatusChange[]
  /** The deployment the links go to (adminAppUrl); none, no links. */
  appUrl: string | undefined
}

// ── A finding as a row ──────────────────────────────────────────────────────

const FROM: Record<string, string> = {
  [LISTING_PAGE_WATCH_NAME]: 'From their website',
  [NEWSLETTER_WATCH_NAME]: 'From their newsletter',
  [KEYSTONE_WATCH_NAME]: 'From Keystone-K’s list',
  [MEKOR_WATCH_NAME]: 'From Mekor Habracha’s list',
  [REFUAH_WATCH_NAME]: 'From Refuah',
  [GOOGLE_SUBMITTER_NAME]: 'From Google',
  [ERUV_WEBSITE_WATCH_NAME]: 'From its website',
}

/** "From their website", by the watch that filed it. */
const fromLine = (watchName: string | null | undefined): string => (watchName && FROM[watchName]) || 'From a watch'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** YYYY-MM-DD in the community's time zone. */
export function dayIn(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "This week’s times", "Next week’s times", or "Times for Nov 29":
 *  a week by where it falls from `today`. */
export function weekName(week: Pick<SpecialSchedule, 'from' | 'to'>, today: string): string {
  if (week.from <= today) return 'This week’s times'
  if (week.from <= addDays(today, 7)) return 'Next week’s times'
  return `Times for ${shortDate(week.from)}`
}

const sameWeek = (a: SpecialSchedule, b: SpecialSchedule) => (a.id && a.id === b.id) || (a.from === b.from && a.to === b.to)
const isNoteLine = (line: string) => /, note (added:|taken off:|now “)/.test(line)

/** What a shul's week finding changes, in a few words: the week, and how
 *  many of its times; a week the listing hasn't got yet, the week alone;
 *  only notes, "A note changed". */
function weekWhat(f: Finding, today: string): string | null {
  if (!f.times) return null
  const changed = f.times.proposedSchedules.filter((w) => {
    const was = f.times!.currentSchedules.find((c) => sameWeek(c, w))
    return !was || JSON.stringify(was) !== JSON.stringify(w)
  })
  if (!changed.length) return null
  const week = [...changed].sort((a, b) => a.from.localeCompare(b.from))[0]
  const was = f.times.currentSchedules.find((c) => sameWeek(c, week))
  const name = weekName(week, today)
  if (!was) return name
  const lines = changed.flatMap((w) => readWeekLines(f.times!.currentSchedules.find((c) => sameWeek(c, w)), w))
  if (lines.length && lines.every(isNoteLine)) return lines.length === 1 ? 'A note changed' : `${lines.length} notes changed`
  return lines.length ? `${name}, ${plural(lines.length, 'change', 'changes')}` : name
}

const KOSHER = /kosher|hechsher|certif|supervis/i
const MENU = /menu|dish/i

/** One finding as a row's kind and few words. */
export function findingWhat(f: Finding, today: string, hoursKeys: ReadonlySet<string> = new Set()): { kind: ChangeKind; what: string } {
  if (f.operation === 'create') return { kind: 'new', what: 'A new place' }
  if (f.operation === 'delete') return { kind: 'closed', what: 'Closed for good' }
  if (f.part === 'week') return { kind: 'times', what: weekWhat(f, today) ?? 'This week’s times' }
  if (f.part) return { kind: 'times', what: TIMES_PART_LABELS[f.part] }
  if (f.times) return { kind: 'times', what: 'Minyan times' }
  const labels = [...new Set(f.lines.map((l) => l.label))]
  const all = (re: RegExp) => labels.length > 0 && labels.every((l) => re.test(l))
  if (all(KOSHER)) return { kind: 'kosher', what: 'Kosher certificate' }
  if (all(MENU)) return { kind: 'menu', what: 'Menu' }
  const kind: ChangeKind = f.lines.length > 0 && f.lines.every((l) => hoursKeys.has(l.key)) ? 'hours' : 'other'
  if (!labels.length) return { kind, what: 'A change' }
  return { kind, what: labels.length === 1 ? labels[0] : `${labels[0]} and ${plural(labels.length - 1, 'more', 'more')}` }
}

/** A place's findings as one row: each one's words, in the order filed. */
export function waitingRow(
  findings: readonly { finding: Finding; watchName: string | null }[],
  opts: { today: string; path: string; hoursKeys?: ReadonlySet<string> },
): WaitingRow {
  const first = findings[0]
  const parts = findings.map(({ finding }) => findingWhat(finding, opts.today, opts.hoursKeys))
  const what = [...new Set(parts.map((p) => p.what))]
  return {
    placeId: first.finding.targetId,
    name: first.finding.name,
    what: what.join(' · '),
    from: fromLine(first.watchName),
    kind: parts[0].kind,
    path: opts.path,
  }
}

// ── The sentence at the top ─────────────────────────────────────────────────

const CHANGE_WORDS: Record<ChangeKind, [string, string]> = {
  times: ['minyan time change', 'minyan time changes'],
  kosher: ['kosher certificate', 'kosher certificates'],
  hours: ['change to hours', 'changes to hours'],
  menu: ['menu change', 'menu changes'],
  new: ['new place', 'new places'],
  closed: ['place closed for good', 'places closed for good'],
  eruv: ['eruv change', 'eruv changes'],
  other: ['other change', 'other changes'],
}
const CHANGE_ORDER: ChangeKind[] = ['times', 'kosher', 'hours', 'menu', 'eruv', 'new', 'closed', 'other']

const STOPPED_WORDS: Record<StoppedKind, [string, string]> = {
  website: ['website stopped working', 'websites stopped working'],
  newsletter: ['newsletter stopped working', 'newsletters stopped working'],
  list: ['list stopped working', 'lists stopped working'],
  job: ['nightly job stopped working', 'nightly jobs stopped working'],
}
const STOPPED_ORDER: StoppedKind[] = ['website', 'newsletter', 'list', 'job']

/** "a, b, and c"; "a and b"; "a". */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

const CLOSED = new Set(['CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'])

/** The night's last word per place from Google, closures and reopenings,
 *  leaving out a place already waiting on To do. */
export function googleChanges(changes: readonly StatusChange[], waiting: readonly WaitingRow[]): StatusChange[] {
  const named = new Set(waiting.map((w) => w.name))
  const last = new Map<string, StatusChange>()
  for (const c of changes) {
    if (named.has(c.name)) continue
    const was = last.get(c.name)
    last.delete(c.name)
    last.set(c.name, { ...c, from: was?.from ?? c.from })
  }
  // A place closed and open again in one night has nothing to say.
  return [...last.values()].filter((c) => c.from !== c.to)
}

function googleSentence(changes: readonly StatusChange[]): string | null {
  if (!changes.length) return null
  const n = changes.length
  if (changes.every((c) => CLOSED.has(c.to))) return `Google marked ${plural(n, 'place', 'places')} closed.`
  if (changes.every((c) => c.to === 'OPERATIONAL')) return `Google marked ${plural(n, 'place', 'places')} open again.`
  return `Google updated ${plural(n, 'place', 'places')} on its own.`
}

/** The sentence under the date: what the night found, by kind of change,
 *  then what broke, then Google. Code, never the AI. */
export function nightSentence(night: Pick<Night, 'waiting' | 'stopped'>, google: readonly StatusChange[]): string {
  const count = <K extends string>(items: readonly { kind: K }[], order: readonly K[], words: Record<K, [string, string]>) =>
    order.flatMap((k) => {
      const n = items.filter((i) => i.kind === k).length
      return n ? [plural(n, words[k][0], words[k][1])] : []
    })
  let changes = count(night.waiting, CHANGE_ORDER, CHANGE_WORDS)
  // Only "other" changes: just changes.
  if (changes.length === 1 && night.waiting.every((w) => w.kind === 'other')) changes = [plural(night.waiting.length, 'change', 'changes')]
  const found = [...changes, ...count(night.stopped, STOPPED_ORDER, STOPPED_WORDS)]
  const said = googleSentence(google)
  const first = found.length ? `${listed(found)}.` : 'Nothing to check.'
  return said ? `${first} ${said}` : first
}

const STATUS_NOW: Record<string, string> = {
  OPERATIONAL: 'is open again',
  CLOSED_TEMPORARILY: 'is now temporarily closed',
  CLOSED_PERMANENTLY: 'is now permanently closed',
}

/** "Google: X is now temporarily closed. Already on the site." */
export function googleLine(changes: readonly StatusChange[]): string {
  const each = changes.map((c) => `${c.name} ${STATUS_NOW[c.to] ?? `is now ${c.to.toLowerCase().replace(/_/g, ' ')}`}.`)
  const tail = changes.length === 1 ? 'Already on the site.' : changes.length === 2 ? 'Both already on the site.' : 'All already on the site.'
  return `Google: ${each.join(' ')} ${tail}`
}

/** "Philly Jewish Guide · Nightly watches: 5 to check". The count is the
 *  places waiting; with none and something broken, that instead. */
export function nightSubject(night: Pick<Night, 'community' | 'waiting' | 'stopped'>): string {
  const what = night.waiting.length
    ? `${night.waiting.length} to check`
    : night.stopped.length
      ? `${night.stopped.length} stopped working`
      : 'nothing to check'
  return `${night.community.name} · Nightly watches: ${what}`
}

/** "Thursday night, Nov 12": the evening before it's sent. */
export function nightName(at: Date, timezone: string): string {
  const evening = new Date(at.getTime() - 12 * 3_600_000)
  const weekday = evening.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
  const date = evening.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })
  return `${weekday} night, ${date}`
}

// ── The email ───────────────────────────────────────────────────────────────

const INK = '#13243a'
const BLUE = '#1d4ed8'
const RED = '#b91c1c'
const SLATE = '#64748b'
const BODY = '#334155'
const FONT = "Figtree, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function esc(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const heading = (text: string, color = SLATE) =>
  `<div style="font-size:12px;font-weight:800;letter-spacing:0.05em;color:${color};text-transform:uppercase;">${esc(text)}</div>`

/** A row with a chevron, as a table: email clients drop flex and SVG. */
function rowLink(href: string | null, cells: string, opts: { chevron: string; last?: boolean; border?: string; background?: string; radius?: boolean }): string {
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding:12px 14px;font-family:${FONT};color:${INK};">${cells}</td>
      <td width="28" align="right" style="padding:12px 14px 12px 0;font-size:22px;line-height:1;color:${opts.chevron};font-family:Arial,sans-serif;">&rsaquo;</td>
    </tr></table>`
  const style = [
    'display:block',
    `color:${INK}`,
    'text-decoration:none',
    opts.last === false ? 'border-bottom:1px solid #f1f5f9' : '',
    opts.border ? `border:1px solid ${opts.border}` : '',
    opts.background ? `background:${opts.background}` : '',
    opts.radius ? 'border-radius:12px' : '',
  ]
    .filter(Boolean)
    .join(';')
  return href ? `<a href="${esc(href)}" style="${style}">${inner}</a>` : `<div style="${style}">${inner}</div>`
}

/** The email for a night, or null when the night had nothing at all. */
export function buildNightlyEmail(night: Night): { subject: string; html: string } | null {
  const google = googleChanges(night.google, night.waiting)
  if (!night.waiting.length && !night.stopped.length && !google.length) return null
  const link = (path: string) => (night.appUrl ? `${night.appUrl}${path}` : null)
  const toDo = link(`/${encodeURIComponent(night.community.slug)}/admin`)

  const sections: string[] = []
  sections.push(`<div>
    <div style="font-size:13px;font-weight:700;color:${SLATE};">${esc(nightName(night.at, night.timezone))}</div>
    <p style="margin:6px 0 0;font-size:18px;line-height:1.4;font-weight:600;color:${INK};">${esc(nightSentence(night, google))}</p>
  </div>`)

  if (night.waiting.length) {
    const rows = night.waiting
      .map((w, i) =>
        rowLink(
          link(w.path),
          `<div style="font-size:16px;font-weight:700;color:${INK};">${esc(w.name)}</div>
           <div style="margin-top:2px;font-size:14px;color:${BODY};">${esc(w.what)}</div>
           <div style="margin-top:2px;font-size:12.5px;color:${SLATE};">${esc(w.from)}</div>`,
          { chevron: '#94a3b8', last: i === night.waiting.length - 1 },
        ),
      )
      .join('')
    const also = [night.earlier ? `${night.earlier} from earlier nights` : '', night.people ? `${night.people} from people` : ''].filter(Boolean)
    sections.push(`<div>
      ${heading(`Waiting for you · ${night.waiting.length}`)}
      <div style="margin-top:8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${rows}</div>
      ${also.length ? `<div style="margin-top:10px;font-size:14px;color:${BODY};">Also in To do: ${esc(listed(also))}</div>` : ''}
      ${toDo ? `<a class="nightly-button" href="${esc(toDo)}" style="margin-top:12px;display:inline-block;padding:12px 22px;border-radius:10px;background:${BLUE};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Open To do</a>` : ''}
    </div>`)
  }

  if (night.stopped.length) {
    const rows = night.stopped
      .map((s) =>
        rowLink(
          link(s.path),
          `<div style="font-size:16px;font-weight:700;color:${INK};">${esc(s.name)}</div>
           <div style="margin-top:2px;font-size:14px;color:#7f1d1d;">${esc(s.why)}</div>`,
          { chevron: RED, border: '#fecaca', background: '#fef2f2', radius: true },
        ),
      )
      .join('<div style="height:8px;"></div>')
    sections.push(`<div>
      ${heading(`Stopped working · ${night.stopped.length}`, RED)}
      <div style="margin-top:8px;">${rows}</div>
    </div>`)
  }

  if (google.length) {
    sections.push(`<div>
      ${heading(`Changed on its own · ${google.length}`)}
      <div style="margin-top:8px;font-size:14px;line-height:1.45;color:${BODY};">${esc(googleLine(google))}</div>
    </div>`)
  }

  sections.push(
    `<div style="padding-top:14px;border-top:1px solid #e2e8f0;font-size:12.5px;color:${SLATE};">Sent once a night to ${esc(night.community.shortName)}’s admins.</div>`,
  )

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&amp;display=swap" rel="stylesheet">
<style>@media (max-width:480px){.nightly-button{display:block !important;text-align:center !important;}}</style>
</head><body style="margin:0;background:#ffffff;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px 28px;font-family:${FONT};color:${INK};">
${sections.join('<div style="height:22px;"></div>')}
</div></body></html>`
  return { subject: nightSubject(night), html }
}
