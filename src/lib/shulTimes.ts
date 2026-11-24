import { parseTimeToMinutes, type Minyan, type Tefillah, type ZmanAnchor } from './davening'
import { datesBetween, sameTime, weekdayOf, type DayZmanim, type RegularReading } from './scheduleUpdate'

// ── A shul's week: what its sources say, by the rule ──────────────────────────
// docs/shul-watch-rebuild.md is the rule; this is it as code, pure, with no
// database or network. One question: given what a shul's sources said
// about a week, what goes to To do for each part of it, Shabbos and the
// weekdays?
//
//   1. A whole source for a part (it shows every day of the part and is
//      the shul's schedule) is that part's week. A day it leaves out has
//      no minyan. Where several are whole, one is picked: a newsletter, then
//      a newsletter, then a regular-schedule page, then any other page.
//      Its week is never set against the usual times.
//   2. Only with no whole source is a short one looked at (a homepage box,
//      Monday only), and not while the shul's newsletter is due to give
//      that part. It is set against the usual times, only to sort it:
//      every usual minyan there at its usual time is the part's week;
//      something extra, different, cancelled or missing goes to the admin;
//      a highlight never removes a minyan, so one that only agrees, or a
//      source that agrees on the days it shows, changes nothing.
//   3. Events, and times the reader couldn't name, are no part at all.
//   4. Notes are compared by what they say: the reader rewords them.

export type Part = 'weekdays' | 'shabbos'
export const PARTS: readonly Part[] = ['weekdays', 'shabbos']

/** Where a reading came from, ranked in this order for the pick (pick). */
export type SourceKind = 'calendar' | 'newsletter' | 'schedule' | 'page'
// A newsletter first (decided Nov 19): a person writes it for that week.
// BZBI's calendar for Nov 22–28 listed Sunday and Tuesday; its newsletter
// that evening listed every weekday, Thanksgiving at 9:00.
const RANK: readonly SourceKind[] = ['newsletter', 'calendar', 'schedule', 'page']

/** What the reader says the source is: the shul's schedule (a calendar, a
 *  "Weekday Services" table, "Regular Minyan Times"), one thing picked out
 *  (a homepage box, "This Shabbat"), or an event (a talk, a party). */
export type Shape = 'schedule' | 'highlight' | 'event'

export type DatedTime = { date: string; tefillah: Tefillah; time: string; anchor?: ZmanAnchor; offsetMinutes?: number; notes?: string; quote?: string; joinLink?: string }

/** A cancellation in words ("No Shabbat Services!"), for a date, or one
 *  tefillah on it. */
export type Cancellation = { date: string; tefillah?: Tefillah; quote: string }

/** `at`: when it was sent or read, ISO; the newer wins between two of a kind. */
export type Source = { id: string; kind: SourceKind; label: string; at: string }

export type SourceRead = {
  source: Source
  shape: Shape
  /** The heading its times sit under, as written. */
  heading?: string
  /** The days it shows, inclusive: a calendar's window, an email's week. */
  shows: { from: string; to: string }
  /** A calendar's last date with anything on it: an empty week before it
   *  is one with no minyan, after it one not posted yet. */
  lastPosted?: string
  times: DatedTime[]
  cancelled?: Cancellation[]
}

/** Our copy of a part's week, as the listing has it. */
export type HeldWeek = { part: Part; times: DatedTime[] }

export type WeekContext = {
  /** Sunday to Shabbos. */
  week: { from: string; to: string }
  today: string
  /** The shul's usual times, this season's. */
  usual: Minyan[]
  held: HeldWeek[]
  zmanim: Record<string, DayZmanim>
  /** The parts the shul's newsletter gives most weeks: short sources for
   *  them wait until the part has begun without it. */
  newsletterGives?: readonly Part[]
}

export type Finding =
  | { do: 'nothing'; part: Part; reason: 'same' | 'not read' | 'waiting' | 'agrees' }
  | {
      do: 'take'
      part: Part
      times: DatedTime[]
      from: SourceRead
      quotes: string[]
      /** Only the usual times, notes and all, with no week held: still put
       *  to the admin, said to be as usual (the user, Nov 20: if it proves
       *  accurate, it may go up on its own later). */
      asUsual?: true
    }
  | {
      do: 'ask'
      part: Part
      from: SourceRead
      /** "Read as a highlight, under “This Shabbat”". */
      readAs: string
      extra: DatedTime[]
      different: { read: DatedTime; usual: Minyan }[]
      missing: { date: string; minyan: Minyan }[]
      quotes: string[]
    }

/** A time's part: Friday night and Shabbos are Shabbos; Friday morning is
 *  a weekday. */
export function partOf({ date, tefillah }: { date: string; tefillah?: Tefillah }): Part {
  const day = weekdayOf(date)
  return day === 'sat' || (day === 'fri' && tefillah !== 'shacharis') ? 'shabbos' : 'weekdays'
}

/** A part's dates in the week: Sunday to Friday, or Friday and Shabbos. */
export function partDates(part: Part, week: { from: string; to: string }): string[] {
  return datesBetween(week.from, week.to).filter((d) => (part === 'shabbos' ? weekdayOf(d) === 'fri' || weekdayOf(d) === 'sat' : weekdayOf(d) !== 'sat'))
}

/** The source used where several give the same thing: by kind, then the
 *  newest. Usual times are picked the same way. */
export function pick<T extends Source>(sources: readonly T[]): T | null {
  return [...sources].sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind) || b.at.localeCompare(a.at))[0] ?? null
}

const COMBINED: readonly Tefillah[] = ['mincha_maariv', 'kabbalas_shabbos']
const EVENING: readonly Tefillah[] = ['mincha', 'maariv', ...COMBINED]

/** The same minyan, however it's named: Friday night's "Mincha, Kabbalas
 *  Shabbos & Maariv" is one minyan, but a weekday's Mincha isn't its Maariv. */
function sameName(a: Tefillah, b: Tefillah): boolean {
  return a === b || ((COMBINED.includes(a) || COMBINED.includes(b)) && EVENING.includes(a) && EVENING.includes(b))
}

/** Words that say nothing a note needs: joiners, "only", and the
 *  tefillah's own name ("Shacharit & Torah Study"). */
const NOTE_FILLER = new Set(['only', 'and', 'with', 'the', 'a', 'an', 'of', 'shacharit', 'shacharis'])

/** A note's words as it says them: lower case, AM/PM dropped, hyphens as
 *  spaces ("In-Person" is "in person"), the filler left out. */
function noteWords(note: string | undefined): string[] {
  return (note ?? '')
    .toLowerCase()
    .replace(/\b(\d{1,2}:\d{2})\s*(am|pm)\b/g, '$1')
    .split(/[^\p{L}\p{N}:]+/u)
    .filter((w) => w && !NOTE_FILLER.has(w))
}

/** Whether `now` says nothing `was` doesn't: only words it has, reordered,
 *  restated ("Online only"), or some dropped. Rodeph Shalom's Thursday
 *  note came four ways in one week (Nov 5–12) and was filed each time;
 *  Kol Tzedek's Shabbos morning three ways from one feed (Nov 19). A new
 *  word is a change: "Not in person", "until 1:30". */
export function sameNote(was: string | undefined, now: string | undefined): boolean {
  const had = new Set(noteWords(was))
  return noteWords(now).every((w) => had.has(w))
}

/** Whether a week read is the one we hold: each time once, the same
 *  minyan, time and note. */
function sameWeek(held: readonly DatedTime[], read: readonly DatedTime[], zmanim: WeekContext['zmanim']): boolean {
  if (held.length !== read.length) return false
  const left = [...held]
  return read.every((t) => {
    const i = left.findIndex((h) => h.date === t.date && sameName(h.tefillah, t.tefillah) && sameTime(h, t, zmanim[t.date]) && sameNote(h.notes, t.notes))
    if (i < 0) return false
    left.splice(i, 1)
    return true
  })
}

const byDate = (a: DatedTime, b: DatedTime) => a.date.localeCompare(b.date)

type InPart = { read: SourceRead; dates: string[]; due: string[]; shown: string[]; times: DatedTime[]; cancelled: Cancellation[] }

/** What a reading says about one part: the part's days it shows, its
 *  times and cancellations on them. `due`: the part's days from today,
 *  the ones a source has to show to give it whole (isWhole). */
function inPart(read: SourceRead, part: Part, week: WeekContext['week'], today: string): InPart {
  const dates = partDates(part, week)
  const shown = dates.filter((d) => d >= read.shows.from && d <= read.shows.to)
  const on = (date: string, tefillah?: Tefillah) => shown.includes(date) && partOf({ date, tefillah }) === part
  return {
    read,
    dates,
    due: dates.filter((d) => d >= today),
    shown,
    times: read.times.filter((t) => on(t.date, t.tefillah)),
    cancelled: (read.cancelled ?? []).filter((c) => on(c.date, c.tefillah)),
  }
}

/** Whether a reading gives a part whole: the shul's schedule, every day of
 *  the part from today shown, and something said about it. A calendar's
 *  empty week says something when the calendar has a date posted after it.
 *
 *  From today: a source read mid-week can't show the days already gone.
 *  Asking for them made Sons of Israel's calendar, read on a Tuesday, a
 *  short source, set against the usual times instead of the week we hold,
 *  so a week the same as ours came back "Posted", with lines like "Not
 *  usual: Shacharis Thu 8:00am" (Thanksgiving, on our week already; Nov 24).
 *  Only against a week we hold, though: with none, the days shown would be
 *  a week with its first days missing, so it is set against the usual
 *  times as before. */
function isWhole(p: InPart, heldWeek: boolean): boolean {
  const needed = heldWeek && p.due.length ? p.due : p.dates
  if (p.read.shape !== 'schedule' || !needed.every((d) => p.shown.includes(d))) return false
  if (p.times.length || p.cancelled.length) return true
  return p.read.source.kind === 'calendar' && !!p.read.lastPosted && p.read.lastPosted > p.dates.at(-1)!
}

const cancels = (c: Cancellation, t: DatedTime) => c.date === t.date && (!c.tefillah || sameName(c.tefillah, t.tefillah))

/** What a short source's days have against the usual times: what matches,
 *  what's extra or at another time, and the usual minyanim it leaves out
 *  on the days it shows. */
function againstUsual(p: InPart, part: Part, ctx: WeekContext) {
  const usualOn = (date: string) => ctx.usual.filter((m) => m.days.includes(weekdayOf(date)) && partOf({ date, tefillah: m.tefillah }) === part)
  const accounted = new Set<string>()
  const key = (date: string, m: Minyan) => `${date} ${m.id}`
  const extra: DatedTime[] = []
  const different: { read: DatedTime; usual: Minyan }[] = []
  for (const t of p.times) {
    const named = usualOn(t.date).filter((m) => sameName(m.tefillah, t.tefillah) && !accounted.has(key(t.date, m)))
    const hit = named.find((m) => sameTime(m, t, ctx.zmanim[t.date])) ?? named[0]
    if (!hit) {
      extra.push(t)
      continue
    }
    accounted.add(key(t.date, hit))
    if (!sameTime(hit, t, ctx.zmanim[t.date])) different.push({ read: t, usual: hit })
  }
  const missing = p.shown.flatMap((date) => usualOn(date).filter((m) => !accounted.has(key(date, m))).map((minyan) => ({ date, minyan })))
  return { extra, different, missing }
}

function forPart(part: Part, reads: readonly SourceRead[], ctx: WeekContext): Finding {
  const parts = reads.map((r) => inPart(r, part, ctx.week, ctx.today))
  const held = ctx.held.find((h) => h.part === part)
  const timesOf = (p: InPart) => p.times.filter((t) => !p.cancelled.some((c) => cancels(c, t))).sort(byDate)
  const pickOf = (ps: InPart[]) => ps.find((p) => p.read.source === pick(ps.map((x) => x.read.source)))!
  const onlyUsual = (p: InPart) => {
    const { extra, different, missing } = againstUsual(p, part, ctx)
    if (extra.length || different.length || missing.length) return false
    return p.times.every((t) => ctx.usual.some((m) => m.days.includes(weekdayOf(t.date)) && sameName(m.tefillah, t.tefillah) && sameTime(m, t, ctx.zmanim[t.date]) && sameNote(m.notes, t.notes)))
  }
  // Of the whole sources, the pick; but if another of its rank gives the
  // week we hold, nothing. Kol Tzedek's homepage and calendar page carry
  // one feed, which the reader gave two ways (Nov 19): the newest read
  // would have filed whichever ran last, night after night.
  const take = (ps: InPart[]): Finding => {
    const p = pickOf(ps)
    const rank = RANK.indexOf(p.read.source.kind)
    // On the days it shows: the days gone are ours either way.
    if (held && ps.some((x) => RANK.indexOf(x.read.source.kind) === rank && sameWeek(held.times.filter((t) => x.shown.includes(t.date)), timesOf(x), ctx.zmanim))) return { do: 'nothing', part, reason: 'same' }
    // A week that is only the usual times still goes to the admin, marked
    // so (the Shtiebel's calendar, Nov 19; the user, Nov 20).
    const asUsual = !held && !p.cancelled.length && onlyUsual(p)
    return { do: 'take', part, times: timesOf(p), from: p.read, quotes: p.cancelled.map((c) => c.quote), ...(asUsual ? { asUsual: true as const } : {}) }
  }

  // While the shul's newsletter is due to give this part, nothing else is
  // filed for it: the newsletter wins, so one item a part, not two.
  const due = !!ctx.newsletterGives?.includes(part) && ctx.today <= partDates(part, ctx.week)[0]
  const whole = parts.filter((p) => isWhole(p, !!held))
  const wholeLetter = whole.filter((p) => p.read.source.kind === 'newsletter')
  if (wholeLetter.length) return take(wholeLetter)
  if (whole.length && due) return { do: 'nothing', part, reason: 'waiting' }
  if (whole.length) return take(whole)

  const short = parts.filter((p) => p.times.length || p.cancelled.length)
  if (!short.length) return { do: 'nothing', part, reason: 'not read' }
  if (due) return { do: 'nothing', part, reason: 'waiting' }

  const p = pickOf(short)
  const against = againstUsual(p, part, ctx)
  // What our week already has isn't news: Lower Merion's homepage, read
  // on a Tuesday, listed Thanksgiving's times and Friday's Kabbalas
  // Shabbos, all in the week we held, as "Not usual" (Nov 24).
  const ours = (t: DatedTime) => !!held?.times.some((h) => h.date === t.date && sameName(h.tefillah, t.tefillah) && sameTime(h, t, ctx.zmanim[t.date]))
  const extra = against.extra.filter((t) => !ours(t))
  const different = against.different.filter((d) => !ours(d.read))
  const missing = against.missing.filter((x) => !held?.times.some((h) => h.date === x.date))
  const quotes = p.cancelled.map((c) => c.quote)
  // A highlight never removes a minyan: what it leaves out is still on.
  const counted = p.read.shape === 'highlight' ? [] : missing
  // Only the usual times again files nothing: the listing shows them
  // already (decided Nov 19, Kesher Israel's homepage).
  if (!extra.length && !different.length && !quotes.length && !counted.length) return { do: 'nothing', part, reason: 'agrees' }
  const readAs = `Read as a ${p.read.shape}${p.read.heading ? `, under “${p.read.heading}”` : ''}`
  return { do: 'ask', part, from: p.read, readAs, extra, different, missing: counted, quotes }
}

/** What a shul's sources say about a week, a finding for each part.
 *  Events, and times the reader couldn't name, are left out first. */
export function weekFrom(reads: readonly SourceRead[], ctx: WeekContext): Finding[] {
  const counted = reads
    .filter((r) => r.shape !== 'event')
    .map((r) => ({ ...r, times: r.times.filter((t) => t.tefillah !== 'other' && t.date >= ctx.week.from && t.date <= ctx.week.to) }))
  return PARTS.map((part) => forPart(part, counted, ctx))
}

/** Whether a calendar is the shul's schedule rather than its classes and
 *  events: each usual minyan at a clock time is on it, that weekday,
 *  within 15 minutes. One set by a zman can't be held against a date's
 *  clock time, so it's left out of the check, not failed: the Shtiebel's
 *  Kabbalat Shabbat at candle lighting kept its whole calendar from
 *  counting (Nov 19). A calendar beside a daily minyan it never lists,
 *  BZBI's missing its Wednesday Maariv, isn't one. */
export function calendarListsUsual(services: readonly { date: string; time?: string | null }[], usual: readonly Minyan[]): boolean {
  const clock = usual.filter((m) => !m.anchor && Number.isFinite(parseTimeToMinutes(m.time)))
  return (
    clock.length > 0 &&
    clock.every((m) =>
      services.some((e) => {
        const at = e.time ? parseTimeToMinutes(e.time) : NaN
        return m.days.includes(weekdayOf(e.date)) && Number.isFinite(at) && Math.abs(at - parseTimeToMinutes(m.time)) <= 15
      }),
    )
  )
}

/** A window no date falls in: a page with no dated times shows no day. */
const SHOWS_NOTHING = { from: '9999-12-31', to: '0000-01-01' }

/** A reader's reply as the rules take it, for one week.
 *  - A newsletter is about its week, so a time it gives by weekday
 *    ("Shacharis Mon–Fri 7:00") is that week's, on each of those days.
 *    A page's undated times are its usual times, not a week: only its
 *    dated ones count.
 *  - It shows: an email, its week; a calendar or page, the window passed
 *    in, else the dates the reading says it covers, else its dated times'.
 *  - Its shape is what the reader said, else a page is a schedule only
 *    when it lists every minyan for its days. A calendar's is passed in:
 *    it is the shul's schedule when it lists the usual minyanim
 *    (calendarListsUsual), whatever else it has. The reader called Rodeph
 *    Shalom's Nov 22 week, services beside Torah study, an event. */
export function fromReading(
  reading: RegularReading,
  source: Source,
  { week, shows, lastPosted, shape: given }: { week: WeekContext['week']; shows?: SourceRead['shows']; lastPosted?: string; shape?: Shape },
): SourceRead {
  const dated = reading.times.filter((t) => t.date).map((t) => t.date!)
  const window =
    shows ??
    (source.kind === 'newsletter'
      ? week
      : reading.from && reading.to
        ? { from: reading.from, to: reading.to }
        : dated.length
          ? { from: dated.reduce((a, b) => (a < b ? a : b)), to: dated.reduce((a, b) => (a > b ? a : b)) }
          : SHOWS_NOTHING)
  const onDays = source.kind === 'newsletter' ? datesBetween(week.from, week.to).filter((d) => d >= window.from && d <= window.to) : []
  const times: DatedTime[] = reading.times.flatMap((t) => {
    const dates = t.date ? [t.date] : onDays.filter((d) => t.days.includes(weekdayOf(d)))
    return dates.map((date) => ({
      date,
      tefillah: t.tefillah,
      time: t.time,
      ...(t.anchor ? { anchor: t.anchor } : {}),
      ...(t.offsetMinutes != null ? { offsetMinutes: t.offsetMinutes } : {}),
      ...(t.notes ? { notes: t.notes } : {}),
      ...(t.joinLink ? { joinLink: t.joinLink } : {}),
      quote: t.quote,
    }))
  })
  const shape: Shape = given ?? reading.shape ?? (reading.complete ? 'schedule' : 'highlight')
  const heading = reading.heading ?? reading.title ?? undefined
  return {
    source,
    shape,
    ...(heading ? { heading } : {}),
    shows: window,
    ...(lastPosted ? { lastPosted } : {}),
    times,
    ...(reading.cancelled?.length ? { cancelled: reading.cancelled } : {}),
  }
}
