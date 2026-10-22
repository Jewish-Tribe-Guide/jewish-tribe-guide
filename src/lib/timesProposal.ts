import { TEFILLAH_LABELS, TEFILLAH_ORDER, formatDays, signUpText, type Minyan } from './davening'
import { minyanimForBox } from './minyanimBox'
import { PART_ORDER, clockMinutes, noteText, shabbosPartOf, timeText } from './minyanText'
import { dateText, scheduleDayText, type ScheduleMinyan, type SpecialSchedule } from './schedules'
import { seasonFromNotes, weekdayOf } from './scheduleUpdate'

// ── What a shul's website proposes its times should be (the user, Oct 21) ───
// "Show what the reader proposes the new listing should be and how it
// differs. Like the moderation queue." The proposal is the whole schedule
// the website gives, in the listing's own two boxes (usual weekday, usual
// Shabbos), each minyan marked: the same, new, changed (with what the
// listing said), or no longer there. The website owns its times, so it's
// written its way ("15 min before sunset"), not as today's clock time.
//
// This week's schedule is a different thing, and stays one ("remember that
// there's a whole difference between this week schedule and usual times"):
// a week the website posted is proposed apart, on its own dates, beside the
// usual times it differs from.

export type ProposalStatus = 'same' | 'new' | 'changed' | 'gone'

/** What one minyan says, each part as it's shown. */
type Parts = { days: string; when: string; note: string | null; season: string | null }

export type ProposalRow = {
  status: ProposalStatus
  /** "Shacharis · Mon, Thu". */
  what: string
  /** "6:45 AM", "15 min before sunset". */
  when: string
  note: string | null
  /** "Summer", "Winter"; none all year. */
  season: string | null
  /** A changed one: what the listing says, for each part that changes
   *  (a season it didn't have reads "All year"). */
  was?: Partial<Parts>
  /** For today's sunset beside it: it's held relative to a zman. */
  anchored: boolean
}

export type ProposalBox = { box: 'weekday' | 'shabbos'; label: string; rows: ProposalRow[] }

const BOX_LABELS = { weekday: 'Usual weekday times', shabbos: 'Usual Shabbos times' } as const
const SEASON = { summer: 'Summer', winter: 'Winter' } as const

/** A minyan's parts, its "Winter only" note read as its season. */
function partsOf(raw: Minyan): Parts & { signUp: string | null } {
  const m = seasonFromNotes(raw)
  return {
    days: formatDays(m.days),
    when: timeText(m),
    note: noteText(m.notes),
    season: m.season ? SEASON[m.season] : null,
    signUp: m.signUp ? signUpText(m.signUp) : null,
  }
}

const KEYS = ['days', 'when', 'note', 'season', 'signUp'] as const
const differing = (a: Minyan, b: Minyan) => {
  const pa = partsOf(a)
  const pb = partsOf(b)
  return KEYS.filter((k) => pa[k] !== pb[k])
}
const overlaps = (a: Minyan, b: Minyan) => a.days.some((d) => b.days.includes(d))

const DAY_ORDER: Minyan['days'] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'rosh_chodesh', 'yom_tov', 'holiday']
const firstDay = (m: Minyan) => Math.min(...m.days.map((d) => DAY_ORDER.indexOf(d)), DAY_ORDER.length)
const minutes = (m: Minyan) => clockMinutes(m.time) ?? 24 * 60
const seasonRank = (m: Minyan) => ({ none: 0, summer: 1, winter: 2 })[seasonFromNotes(m).season ?? 'none']

/** As the listing's box orders them: Shabbos in the order of Shabbos, the
 *  week by tefillah; then day, time, and all year before summer and winter. */
function order(box: ProposalBox['box']) {
  const lead = (m: Minyan) => (box === 'shabbos' ? PART_ORDER.indexOf(shabbosPartOf(m)) : TEFILLAH_ORDER.indexOf(m.tefillah))
  return (a: Minyan, b: Minyan) => lead(a) - lead(b) || firstDay(a) - firstDay(b) || minutes(a) - minutes(b) || seasonRank(a) - seasonRank(b) || TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah)
}

function row(m: Minyan, status: ProposalStatus, was?: Minyan): ProposalRow {
  const p = partsOf(m)
  const out: ProposalRow = {
    status,
    what: `${TEFILLAH_LABELS[m.tefillah]}${p.days ? ` · ${p.days}` : ''}`,
    when: p.when,
    note: [p.note, p.signUp].filter(Boolean).join(' · ') || null,
    season: p.season,
    anchored: !!m.anchor,
  }
  if (was) {
    const o = partsOf(was)
    const changed = differing(m, was)
    out.was = {}
    if (changed.includes('days')) out.was.days = o.days
    if (changed.includes('when')) out.was.when = o.when
    if (changed.includes('note') || changed.includes('signUp')) out.was.note = [o.note, o.signUp].filter(Boolean).join(' · ') || 'No note'
    if (changed.includes('season')) out.was.season = o.season ?? 'All year'
  }
  return out
}

/** One box: each minyan the website gives, beside the listing's. The same
 *  minyan both have is the same; what's left is paired, most alike first
 *  (same tefillah, a day in common), as changed; the rest are new, or no
 *  longer there. */
function proposeBox(current: readonly Minyan[], proposed: readonly Minyan[], box: ProposalBox['box']): ProposalBox {
  const was = minyanimForBox(current, box)
  const now = minyanimForBox(proposed, box)
  const left = new Set(was)
  const status = new Map<Minyan, { status: ProposalStatus; was?: Minyan }>()
  for (const m of now) {
    const same = [...left].find((o) => o.tefillah === m.tefillah && differing(m, o).length === 0)
    if (same) {
      left.delete(same)
      status.set(m, { status: 'same' })
    }
  }
  const pairs = now
    .filter((m) => !status.has(m))
    .flatMap((m) => [...left].filter((o) => o.tefillah === m.tefillah && (overlaps(m, o) || o.id === m.id)).map((o) => ({ m, o, score: differing(m, o).length - (o.id === m.id ? 0.5 : 0) })))
    .sort((a, b) => a.score - b.score)
  for (const { m, o } of pairs) {
    if (status.has(m) || !left.has(o)) continue
    left.delete(o)
    status.set(m, { status: 'changed', was: o })
  }
  const rows = [...now.map((m) => ({ m, ...(status.get(m) ?? { status: 'new' as const }) })), ...[...left].map((m) => ({ m, status: 'gone' as const, was: undefined }))]
  const sort = order(box)
  rows.sort((a, b) => sort(a.m, b.m))
  return { box, label: BOX_LABELS[box], rows: rows.map((r) => row(r.m, r.status, r.was)) }
}

/** The website's usual times, in the listing's two boxes, each minyan
 *  marked. A box neither has is left out. */
export function usualProposal(current: readonly Minyan[], proposed: readonly Minyan[]): ProposalBox[] {
  return (['weekday', 'shabbos'] as const).map((b) => proposeBox(current, proposed, b)).filter((b) => b.rows.length > 0)
}

export const changeCount = (boxes: readonly ProposalBox[]) => boxes.reduce((n, b) => n + b.rows.filter((r) => r.status !== 'same').length, 0)

/** The usual times' changes in a line, for the shul's row: "Mincha &
 *  Maariv · Fri: 7 PM in summer, at candle lighting, never after 7 PM in
 *  winter". The first minyan's, then how many more. */
export function proposalLine(boxes: readonly ProposalBox[]): string | null {
  const groups = new Map<string, string[]>()
  for (const r of boxes.flatMap((b) => b.rows)) {
    if (r.status === 'same') continue
    const say = r.status === 'gone' ? `no longer ${r.when}` : `${r.status === 'new' ? 'new, ' : ''}${r.when}${r.season ? ` in ${r.season.toLowerCase()}` : ''}`
    groups.set(r.what, [...(groups.get(r.what) ?? []), say])
  }
  const [first, ...rest] = [...groups]
  if (!first) return null
  const more = rest.reduce((n, [, says]) => n + says.length, 0)
  return `${first[0]}: ${first[1].join(', ')}${more ? `. And ${more} more ${more === 1 ? 'change' : 'changes'}` : ''}`
}

// ── This week's schedule ────────────────────────────────────────────────────

export type WeekRow = { what: string; when: string; note: string | null; usually: string | null }
export type WeekProposal = {
  /** "This week’s schedule, Oct 19 – Oct 25", or a Yom Tov's own name. */
  title: string
  isWeek: boolean
  days: { label: string; rows: WeekRow[] }[]
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
const fullDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** What the usual times say for one of the week's minyanim, when it's one
 *  time and not this one: "usually 9:15 AM". */
function usually(m: ScheduleMinyan, on: string, current: readonly Minyan[]): string | null {
  if (!isDate(on)) return null
  const day = weekdayOf(on)
  const times = new Set(current.filter((r) => r.tefillah === m.tefillah && r.days.includes(day)).map((r) => timeText(r)))
  if (times.size !== 1) return null
  const [t] = times
  return t === timeText(m) ? null : t
}

/** The schedules the website would add or change: a posted week, or a
 *  dated one-off, each on its own days. Ones the listing has as they are
 *  aren't proposed; `gone`, the names of those it would take off. */
export function scheduleProposal(current: readonly SpecialSchedule[], proposed: readonly SpecialSchedule[], usual: readonly Minyan[]): { weeks: WeekProposal[]; gone: string[] } {
  const plain = (s: SpecialSchedule) => JSON.stringify(s)
  const had = new Set(current.map(plain))
  const weeks = proposed
    .filter((s) => !had.has(plain(s)))
    .map((s): WeekProposal => {
      const byDay = new Map<string, ScheduleMinyan[]>()
      for (const m of s.minyanim) for (const on of m.on) byDay.set(on, [...(byDay.get(on) ?? []), m])
      const days = [...byDay]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([on, ms]) => ({
          label: isDate(on) ? fullDay(on) : scheduleDayText(on),
          rows: [...ms]
            .sort((a, b) => (clockMinutes(a.time) ?? 24 * 60) - (clockMinutes(b.time) ?? 24 * 60) || TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah))
            .map((m) => ({ what: TEFILLAH_LABELS[m.tefillah], when: timeText(m), note: noteText(m.notes), usually: usually(m, on, usual) })),
        }))
      const dates = `${dateText(s.from)}${s.to !== s.from ? ` – ${dateText(s.to)}` : ''}`
      return { title: s.kind === 'week' ? `This week’s schedule, ${dates}` : `${s.name}, ${dates}`, isWeek: s.kind === 'week', days }
    })
  const kept = new Set(proposed.map((s) => s.id))
  return { weeks, gone: current.filter((s) => !kept.has(s.id)).map((s) => s.name) }
}
