import { TEFILLAH_LABELS, TEFILLAH_ORDER, formatDays, joinText, signUpText, type Minyan } from './davening'
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
  /** "Shacharis": its name in a box, under its group's heading. */
  tefillah: string
  /** Its heading in the box, as the listing's box reads: "Friday night",
   *  "Shabbos day"; "Sunday", "Monday to Friday". */
  group: string
}

export type ProposalBox = { box: 'weekday' | 'shabbos'; label: string; rows: ProposalRow[] }

const BOX_LABELS = { weekday: 'Usual weekday times', shabbos: 'Usual Shabbos times' } as const
const SEASON = { summer: 'Summer', winter: 'Winter' } as const

/** A minyan's parts, its "Winter only" note read as its season. */
function partsOf(raw: Minyan): Parts & { signUp: string | null; join: string | null } {
  const m = seasonFromNotes(raw)
  return {
    days: formatDays(m.days),
    when: timeText(m),
    note: noteText(m.notes),
    season: m.season ? SEASON[m.season] : null,
    signUp: m.signUp ? signUpText(m.signUp) : null,
    join: m.joinLink?.trim() ? joinText(m.joinLink) : null,
  }
}

const KEYS = ['days', 'when', 'note', 'season', 'signUp', 'join'] as const
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

const DAY_LONG: Record<Minyan['days'][number], string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Shabbos',
  rosh_chodesh: 'Rosh Chodesh',
  yom_tov: 'Yom Tov',
  holiday: 'Public holidays',
}

/** A weekday box's heading for a minyan's days: "Sunday", "Monday to
 *  Friday", "Monday and Thursday", "Rosh Chodesh". */
export function daysHeading(days: Minyan['days']): string {
  const real = DAY_ORDER.slice(0, 7).filter((d) => days.includes(d))
  const idx = real.map((d) => DAY_ORDER.indexOf(d))
  const run = real.length >= 3 && idx.every((x, i) => i === 0 || x === idx[i - 1] + 1)
  const names = run ? [`${DAY_LONG[real[0]]} to ${DAY_LONG[real.at(-1)!]}`] : real.map((d) => DAY_LONG[d])
  const all = [...names, ...DAY_ORDER.slice(7).filter((d) => days.includes(d)).map((d) => DAY_LONG[d])]
  return all.length < 2 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`
}

function row(m: Minyan, status: ProposalStatus, box: ProposalBox['box'], was?: Minyan): ProposalRow {
  const p = partsOf(m)
  const out: ProposalRow = {
    status,
    what: `${TEFILLAH_LABELS[m.tefillah]}${p.days ? ` · ${p.days}` : ''}`,
    when: p.when,
    note: [p.note, p.signUp, p.join].filter(Boolean).join(' · ') || null,
    season: p.season,
    anchored: !!m.anchor,
    tefillah: TEFILLAH_LABELS[m.tefillah],
    group: box === 'shabbos' ? (shabbosPartOf(m) === 'friday' ? 'Friday night' : 'Shabbos day') : daysHeading(m.days),
  }
  if (was) {
    const o = partsOf(was)
    const changed = differing(m, was)
    out.was = {}
    if (changed.includes('days')) out.was.days = o.days
    if (changed.includes('when')) out.was.when = o.when
    if (changed.includes('note') || changed.includes('signUp') || changed.includes('join')) out.was.note = [o.note, o.signUp, o.join].filter(Boolean).join(' · ') || 'No note'
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
  return { box, label: BOX_LABELS[box], rows: rows.map((r) => row(r.m, r.status, box, r.was)) }
}

/** The website's usual times, in the listing's two boxes, each minyan
 *  marked. A box neither has is left out. */
export function usualProposal(current: readonly Minyan[], proposed: readonly Minyan[]): ProposalBox[] {
  return (['weekday', 'shabbos'] as const).map((b) => proposeBox(current, proposed, b)).filter((b) => b.rows.length > 0)
}

/** What a box would change, for its pill: "7 new", "2 changed", "1 taken
 *  off", or "3 updates" for more than one kind. Null when it's the same. */
export function boxPill(rows: readonly Pick<ProposalRow, 'status'>[]): string | null {
  const n = (s: ProposalStatus) => rows.filter((r) => r.status === s).length
  const kinds = [
    [n('new'), 'new'],
    [n('changed'), 'changed'],
    [n('gone'), 'taken off'],
  ] as const
  const some = kinds.filter(([k]) => k > 0)
  if (!some.length) return null
  if (some.length === 1) return `${some[0][0]} ${some[0][1]}`
  const all = some.reduce((t, [k]) => t + k, 0)
  return `${all} updates`
}

/** Clock times that share AM or PM, run together: "6:45 and 8:15 AM". */
export function joinClocks(whens: readonly string[]): string | null {
  const got = whens.map((w) => w.match(/^(\d{1,2}(?::\d{2})?) (AM|PM)$/))
  if (got.some((g) => !g) || new Set(got.map((g) => g![2])).size !== 1) return null
  const times = got.map((g) => g![1])
  return `${times.length > 1 ? `${times.slice(0, -1).join(', ')} and ` : ''}${times.at(-1)} ${got[0]![2]}`
}

export type RowGroup<R> = { label: string; rows: R[] }

/** A box's rows under their headings, in the order each heading first
 *  comes; minyanim with nothing to say but the time run together
 *  ("Shacharis 6:45 and 8:15 AM"), the same and alike. A marked one stays
 *  on its own row. */
export function groupedRows(rows: readonly ProposalRow[]): RowGroup<ProposalRow>[] {
  const groups = new Map<string, ProposalRow[]>()
  for (const r of rows) {
    const g = groups.get(r.group) ?? []
    const like = r.status === 'same' && g.find((o) => o.status === 'same' && o.tefillah === r.tefillah && o.note === r.note && o.season === r.season && !o.anchored && !r.anchored && joinClocks([o.when, r.when]))
    if (like) {
      const i = g.indexOf(like)
      const whens = [...(like.when.match(/^(.*) (AM|PM)$/)![1].split(/, | and /).map((t) => `${t} ${like.when.slice(-2)}`)), r.when]
      g[i] = { ...like, when: joinClocks(whens) ?? like.when }
    } else g.push(r)
    groups.set(r.group, g)
  }
  return [...groups].map(([label, rs]) => ({ label, rows: rs }))
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
  /** "Oct 19–25". */
  range: string
  isWeek: boolean
  /** Their calendar's whole week, with nothing in it: no minyan that week. */
  none: boolean
  days: { label: string; rows: WeekRow[] }[]
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
/** "Wed, Oct 21"; "Shabbos, Oct 24". */
const shortDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`)
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${d.getUTCDay() === 6 ? 'Shabbos' : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}, ${md}`
}

/** "Oct 21–24", "Oct 30–Nov 2", "Oct 24". */
export function rangeText(from: string, to: string): string {
  const [fm, fd] = dateText(from).split(' ')
  const [tm, td] = dateText(to).split(' ')
  return from === to ? dateText(from) : `${fm} ${fd}–${tm === fm ? td : `${tm} ${td}`}`
}

/** A day's times, minyanim with nothing to say but the time run together. */
function runTogether(rows: WeekRow[]): WeekRow[] {
  const out: WeekRow[] = []
  for (const r of rows) {
    const like = !r.usually && out.find((o) => !o.usually && o.what === r.what && o.note === r.note && joinClocks([o.when, r.when]))
    if (like) {
      const whens = [...like.when.match(/^(.*) (AM|PM)$/)![1].split(/, | and /).map((t) => `${t} ${like.when.slice(-2)}`), r.when]
      out[out.indexOf(like)] = { ...like, when: joinClocks(whens) ?? like.when }
    } else out.push(r)
  }
  return out
}

/** Days in a row with the same times, said once: "Wed, Oct 21 and Thu,
 *  Oct 22"; three or more, "Sun, Oct 18 to Tue, Oct 20". */
function sameDays(days: WeekProposal['days']): WeekProposal['days'] {
  const out: { labels: string[]; rows: WeekRow[] }[] = []
  for (const d of days) {
    const last = out.at(-1)
    if (last && JSON.stringify(last.rows) === JSON.stringify(d.rows)) last.labels.push(d.label)
    else out.push({ labels: [d.label], rows: d.rows })
  }
  return out.map((g) => ({ label: g.labels.length === 1 ? g.labels[0] : g.labels.length === 2 ? g.labels.join(' and ') : `${g.labels[0]} to ${g.labels.at(-1)}`, rows: g.rows }))
}

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
          label: isDate(on) ? shortDay(on) : scheduleDayText(on),
          rows: runTogether(
            [...ms]
              .sort((a, b) => TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) || (clockMinutes(a.time) ?? 24 * 60) - (clockMinutes(b.time) ?? 24 * 60))
              .map((m) => ({ what: TEFILLAH_LABELS[m.tefillah], when: timeText(m), note: [noteText(m.notes), m.signUp && signUpText(m.signUp), m.joinLink?.trim() && joinText(m.joinLink)].filter(Boolean).join(' · ') || null, usually: usually(m, on, usual) })),
          ),
        }))
      const dates = `${dateText(s.from)}${s.to !== s.from ? ` – ${dateText(s.to)}` : ''}`
      return { title: s.kind === 'week' ? `This week’s schedule, ${dates}` : `${s.name}, ${dates}`, range: rangeText(s.from, s.to), isWeek: s.kind === 'week', none: !!s.whole && !s.minyanim.length, days: sameDays(days) }
    })
  const kept = new Set(proposed.map((s) => s.id))
  return { weeks, gone: current.filter((s) => !kept.has(s.id)).map((s) => s.name) }
}

export type WeekChangeRow = {
  what: string
  /** "Mon, Oct 26". */
  day: string
  /** Its time and note as proposed; "Taken off" for one gone. */
  when: string
  /** new, changed, gone: against the listing's own copy of the week;
   *  usual: a week it hasn't got, differing from the usual times. */
  status: 'new' | 'changed' | 'gone' | 'usual'
  /** What the listing's week says, or the usual time. */
  was: string | null
}
export type WeekChange = {
  title: string
  /** How many minyanim the listing's own copy of the week has; null, none. */
  had: number | null
  /** How many the week would have. */
  total: number
  /** Of them, how many the listing's copy has as they are. */
  same: number
  none: boolean
  rows: WeekChangeRow[]
}

/** One minyan on one day, in a line: "8:15 AM · Sign-up: chat.whatsapp.com/MI". */
const dayLine = (m: ScheduleMinyan) => [timeText(m), noteText(m.notes), m.signUp && signUpText(m.signUp), m.joinLink?.trim() && joinText(m.joinLink)].filter(Boolean).join(' · ')
const byClock = (a: ScheduleMinyan, b: ScheduleMinyan) => (clockMinutes(a.time) ?? 24 * 60) - (clockMinutes(b.time) ?? 24 * 60)
const dayLabel = (on: string) => (isDate(on) ? shortDay(on) : scheduleDayText(on))

/** The listing's own copy of a week: the same schedule, or one on the
 *  same dates (the same week read again under a new id). */
const ownCopy = (current: readonly SpecialSchedule[], s: SpecialSchedule) =>
  current.find((c) => c.id === s.id) ?? current.find((c) => c.from === s.from && c.to === s.to && (c.kind ?? null) === (s.kind ?? null))

/** Each day's minyanim of one tefillah: "2026-10-26 shacharis". */
function byDayTefillah(s: SpecialSchedule): Map<string, ScheduleMinyan[]> {
  const out = new Map<string, ScheduleMinyan[]>()
  for (const m of s.minyanim) for (const on of m.on) out.set(`${on} ${m.tefillah}`, [...(out.get(`${on} ${m.tefillah}`) ?? []), m])
  return out
}

/** What a week the website gives would change, against the listing's own
 *  copy of that week: a minyan new, changed or taken off, a day and
 *  tefillah at a time, and how many are as they are. A week the listing
 *  hasn't got (or has with nothing in it) is new: how many minyanim, and
 *  the ones that differ from the usual times. `gone`, the names of the
 *  schedules it would take off. */
export function weekChanges(current: readonly SpecialSchedule[], proposed: readonly SpecialSchedule[], usual: readonly Minyan[]): { weeks: WeekChange[]; gone: string[] } {
  const plain = (s: SpecialSchedule) => JSON.stringify(s)
  const had = new Set(current.map(plain))
  const mine = new Set<string>()
  const weeks = proposed
    .filter((s) => !had.has(plain(s)))
    .flatMap((s): WeekChange[] => {
      const own = ownCopy(current, s)
      if (own) mine.add(own.id)
      const dates = `${dateText(s.from)}${s.to !== s.from ? ` – ${dateText(s.to)}` : ''}`
      const title = s.kind === 'week' ? `This week’s schedule, ${dates}` : `${s.name}, ${dates}`
      const total = s.minyanim.reduce((n, m) => n + m.on.length, 0)
      const base = { title, total, none: !!s.whole && !s.minyanim.length }
      const rows: (WeekChangeRow & { on: string; tefillah: Minyan['tefillah']; at: number })[] = []
      const push = (on: string, m: ScheduleMinyan, status: WeekChangeRow['status'], was: string | null, when = dayLine(m)) =>
        rows.push({ what: TEFILLAH_LABELS[m.tefillah], day: dayLabel(on), when, status, was, on, tefillah: m.tefillah, at: clockMinutes(m.time) ?? 24 * 60 })
      let same = 0
      if (!own?.minyanim.length) {
        for (const m of s.minyanim) for (const on of m.on) {
          const was = usually(m, on, usual)
          if (was) push(on, m, 'usual', was)
        }
      } else {
        const before = byDayTefillah(own)
        const after = byDayTefillah(s)
        for (const key of new Set([...before.keys(), ...after.keys()])) {
          const on = key.split(' ')[0]
          const left = [...(before.get(key) ?? [])]
          const right: ScheduleMinyan[] = []
          for (const m of after.get(key) ?? []) {
            const i = left.findIndex((o) => dayLine(o) === dayLine(m))
            if (i >= 0) {
              left.splice(i, 1)
              same++
            } else right.push(m)
          }
          left.sort(byClock)
          right.sort(byClock)
          right.forEach((m, i) => (left[i] ? push(on, m, 'changed', dayLine(left[i])) : push(on, m, 'new', null)))
          for (const o of left.slice(right.length)) push(on, o, 'gone', dayLine(o), 'Taken off')
        }
      }
      if (own?.minyanim.length && !rows.length) return []
      rows.sort((a, b) => a.on.localeCompare(b.on) || TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) || a.at - b.at)
      return [{ ...base, had: own ? own.minyanim.reduce((n, m) => n + m.on.length, 0) : null, same, rows: rows.map(({ what, day, when, status, was }) => ({ what, day, when, status, was })) }]
    })
  const kept = new Set(proposed.map((s) => s.id))
  return { weeks, gone: current.filter((s) => !kept.has(s.id) && !mine.has(s.id)).map((s) => s.name) }
}
