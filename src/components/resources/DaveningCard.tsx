'use client'

import { useContext, useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan } from '@/lib/davening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { geoKey, geoOrCommunityDefault, resolveAnchorTime, type AnchorTimes } from '@/lib/useZmanAnchors'
import { dateText, readSchedules, regularMinyanim, scheduleDayText, sendsWeekly, thisWeeksPost, type DayPosting, type SpecialSchedule } from '@/lib/schedules'
import { clockMinutes, noteText, SHABBOS_PART_LABELS, shabbosList, timeText, weekdayTable, type ShabbosLine } from '@/lib/weekTable'
import { DAY_KEYS, type DayKey } from '@/lib/hours'
import { sectionConfirmedAt } from '@/lib/listingView'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'
import { ChevronRightIcon, PlusIcon } from '@/components/icons'
import AddScheduleBox from './AddScheduleBox'
import UpdateTimesBox from './UpdateTimesBox'
import { TellAboutContext } from './tellAbout'
import DaveningTimes from './DaveningTimes'
import { Card } from './listingParts'
import FreshnessFooter from './FreshnessFooter'

/** A shul's main thing (agreed Oct 6): its usual times as two boxes, “Usual
 *  weekday times” (one small table, today marked) and “Usual Shabbos times”
 *  (in the order Shabbos happens), each written as the shul gives them, with
 *  this week's clock time in grey where the guide knows it. From Thursday
 *  evening through Shabbos, Shabbos comes first. See weekTable.ts.
 *
 *  Over a Yom Tov (step 4, agreed Oct 1): the shul's special schedule in its
 *  own box on top while it applies, the usual times folded under it; or,
 *  where it hasn't posted one, a box saying so, with “Know their Sukkos
 *  times? Add them”.
 *
 *  “Update their times” (agreed Oct 1): paste the shul's new schedule or this
 *  Shabbos's times, or add one time, and see the result to send
 *  (UpdateTimesBox). */
export default function DaveningCard({
  item,
  minyanim,
  schedules: rawSchedules,
  category,
}: {
  item: DirectoryResource
  minyanim: unknown
  /** The shul's special schedules, stored beside its times. */
  schedules?: unknown
  category?: CategoryConfig
}) {
  const [adding, setAdding] = useState(false)
  const [sent, setSent] = useState(false)
  // Which box "Update their times" was opened from, and where it said
  // thanks: it opens in place, in the box that asked.
  const [updatingIn, setUpdatingIn] = useState<string | null>(null)
  const [updated, setUpdated] = useState<{ in: string; what: 'sent' | 'confirmed' } | null>(null)
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({})
  const tellAbout = useContext(TellAboutContext)
  const schedule = useMinyanSchedule(null, [item])
  const canAdd = ui.contributions.edit && (!category || resolveCapabilities(category.capabilities).edit)

  // Whose times today's and tomorrow's are: a special schedule's, or the
  // regular ones on a festival day with none posted.
  const schedules = readSchedules(rawSchedules)
  const posting: DayPosting[] = schedule ? [schedule.today, schedule.tomorrow].map((d) => schedule.posting[item.id]?.[d.date] ?? { kind: 'regular' }) : []
  const special = posting.find((p): p is Extract<DayPosting, { kind: 'schedule' }> => p.kind === 'schedule')
  const specialFound = special ? schedules.find((s) => s.name === special.name) : undefined
  // A week the shul sent out has its own box, "This week's schedule".
  const specialSchedule = specialFound?.kind === 'week' ? undefined : specialFound
  const notPosted = posting.find((p): p is Extract<DayPosting, { kind: 'not-posted' }> => p.kind === 'not-posted')

  // Older rows keep their times as one line of text.
  if (typeof minyanim === 'string') {
    return (
      <Card title="Davening times" testId="listing-davening" footer={<FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} subject="Times" />}>
        <DaveningTimes legacyText={minyanim} />
      </Card>
    )
  }

  const rows = regularMinyanim(minyanim)
  const season = schedule?.season ?? null
  const week = weekdayTable(rows, season)
  const shab = shabbosList(rows, season)
  const anchors = schedule?.anchors[geoKey(geoOrCommunityDefault(item.geo))]
  const today = schedule?.todayKey ?? null
  const shabbosFirst = !!schedule && (today === 'fri' || today === 'sat' || (today === 'thu' && schedule.nowMinutes >= 18 * 60))

  // This week's schedule, when the shul sends one out (Oct 6): what it sent
  // for this week, or a box waiting for it.
  const todayDate = schedule?.today.date ?? null
  const post = todayDate ? thisWeeksPost(schedules, todayDate) : undefined
  const waiting = !post && !!todayDate && sendsWeekly(schedules, todayDate)
  const postRows = post ? weekRows(post) : []
  const postDays = new Set(postRows.flatMap((m) => m.days))

  // The usual times a schedule replaces fold to one line under it.
  const foldReason = (key: 'week' | 'shabbos') =>
    specialSchedule?.mode === 'replace'
      ? `Not now: the ${specialSchedule.name} times above replace them`
      : post && (key === 'shabbos' ? postDays.has('fri') || postDays.has('sat') : ['sun', 'mon', 'tue', 'wed', 'thu'].some((d) => postDays.has(d as DayKey)))
        ? 'Not this week: this week’s schedule replaces them'
        : null

  // On a category page, the regular "+ Add" box about the shul (Oct 6): one
  // way to send a schedule everywhere, a photo or PDF or pasted email, its
  // week shown to check before sending. Without one (the Map), in place.
  const open = (key: string) => (tellAbout ? tellAbout(item, undefined, { times: true }) : setUpdatingIn(key))
  /** "Update their times", opened in the box `key`, or its thanks. */
  const updateIn = (key: string) => {
    if (!canAdd) return null
    if (updated?.in === key)
      return (
        <p role="status" className="mt-2 text-[13.5px] font-semibold text-emerald-700">
          {updated.what === 'sent' ? 'Thanks! An admin checks them before everyone sees them.' : 'Thanks! Marked confirmed.'}
        </p>
      )
    if (updatingIn !== key) return null
    return (
      <div className="mt-2">
        <UpdateTimesBox
          item={item}
          minyanim={rows}
          onSent={(what) => {
            setUpdated({ in: key, what })
            setUpdatingIn(null)
          }}
          onClose={() => setUpdatingIn(null)}
        />
      </div>
    )
  }
  /** A box's own date (agreed Oct 6, migration 072) and, beside it, the way
   *  to send new times: "Confirmed Sep 29 · Update their times". */
  const foot = (key: string, section: 'weekday' | 'shabbos', subject: string) => (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <FreshnessFooter resourceId={item.id} confirmedAt={sectionConfirmedAt(item, section)} subject={subject} section={section} />
      {canAdd && updatingIn !== key && updated?.in !== key && (
        <button type="button" onClick={() => open(key)} className="cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
          Update their times
        </button>
      )}
    </div>
  )

  const folded = (key: 'week' | 'shabbos', title: string, body: ReactNode) => {
    const reason = foldReason(key)
    return reason && !unfolded[key] ? (
      <button
        key={key}
        type="button"
        onClick={() => setUnfolded((u) => ({ ...u, [key]: true }))}
        aria-expanded={false}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left"
        data-testid="davening-folded"
      >
        <span>
          <span className="block text-base font-extrabold text-slate-900">{title}</span>
          <span className="mt-0.5 block text-[13.5px] text-muted">{reason}</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 rotate-90 text-slate-400" />
      </button>
    ) : (
      body
    )
  }

  const weekBox = week
    ? folded(
        'week',
        'Usual weekday times',
        <Card key="week" title="Usual weekday times" testId="davening-weekday" footer={foot('week', 'weekday', 'Weekday times')}>
          <WeekTable table={week} today={today} />
          <Notes
            lines={[
              ...week.rules.map((r) => {
                const at = resolveAnchorTime(r.row, anchors)
                return at ? `${capital(r.text)}: ${at} today.` : null
              }),
              ...week.notes,
              week.otherSeason,
            ]}
          />
          {updateIn('week')}
        </Card>,
      )
    : shab && (
        <div key="week" className="px-1" data-testid="davening-no-weekday">
          <p className="text-[13.5px] text-muted">
            No weekday minyan listed.{' '}
            {canAdd && updatingIn !== 'no-weekday' && (
              <button type="button" onClick={() => open('no-weekday')} className="cursor-pointer font-bold text-primary hover:underline">
                Add one
              </button>
            )}
          </p>
          {updateIn('no-weekday')}
        </div>
      )

  const shabbosBox = shab
    ? folded(
        'shabbos',
        'Usual Shabbos times',
        <Card key="shabbos" title="Usual Shabbos times" testId="davening-shabbos" footer={foot('shabbos-usual', 'shabbos', 'Shabbos times')}>
          <ShabbosLines lines={shab.lines} anchors={anchors} today={today} />
          <Notes lines={[shab.otherSeason]} />
          {updateIn('shabbos-usual')}
        </Card>,
      )
    : week && (
        <Card key="shabbos" title="Usual Shabbos times" testId="davening-shabbos">
          <p className="pt-0.5 text-[14.5px] leading-relaxed text-slate-700">Their Shabbos times aren’t listed yet.{canAdd ? ' If you’ve davened there, add them.' : ''}</p>
          {canAdd && updatingIn !== 'shabbos' && (
            <button type="button" onClick={() => open('shabbos')} className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 py-1 text-[14.5px] font-bold text-primary">
              <PlusIcon className="h-4 w-4" />
              Add their Shabbos times
            </button>
          )}
          {updateIn('shabbos')}
        </Card>
      )

  const postTable = post ? weekdayTable(postRows, null) : null
  const postShabbos = post ? shabbosList(postRows, null) : null

  return (
    <div className="space-y-5" data-testid="listing-davening">
      {post && (
        <Card
          title="This week’s schedule"
          testId="davening-this-week"
          footer={
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              {post.postedAt && <span>Posted {dateText(post.postedAt.slice(0, 10), { weekday: true })}.</span>}
              {canAdd && updatingIn !== 'this-week' && updated?.in !== 'this-week' && (
                <button type="button" onClick={() => open('this-week')} className="cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
                  Update their times
                </button>
              )}
            </div>
          }
        >
          <p className="text-[14.5px] font-semibold text-slate-700" data-testid="davening-this-week-dates">
            {postTitle(post)}
          </p>
          <p className="mt-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[13px] leading-snug text-slate-700">In place of their usual times for these dates only.</p>
          {postShabbos && <ShabbosLines lines={postShabbos.lines} anchors={anchors} today={today} />}
          {postTable && <WeekTable table={postTable} today={today} />}
          {updateIn('this-week')}
        </Card>
      )}
      {waiting && (
        <Card title="This week’s schedule" testId="davening-this-week-waiting" footer={canAdd ? 'Paste their email or add a photo; an admin checks it.' : undefined}>
          <p className="pt-0.5 text-[14.5px] leading-relaxed text-slate-700">They send out a schedule each week; this week’s isn’t on the guide yet. Until it is, their usual times are below.</p>
          {canAdd && updatingIn !== 'this-week' && !(updated?.in === 'this-week') && (
            <button
              type="button"
              onClick={() => open('this-week')}
              className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white text-[15px] font-bold text-primary hover:bg-slate-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add this week’s schedule
            </button>
          )}
          {updateIn('this-week')}
        </Card>
      )}
      {specialSchedule && (
        <Card title={specialSchedule.name} testId="davening-special-box">
          <p className="text-[13.5px] font-semibold text-green-700" data-testid="davening-special">
            {specialSchedule.mode === 'replace' ? 'In place of their usual times' : 'As well as their usual times'} until {dateText(specialSchedule.to, { weekday: true })}
          </p>
          <SpecialTimes schedule={specialSchedule} />
        </Card>
      )}
      {notPosted && !specialSchedule && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3" data-testid="davening-not-posted">
          <p className="text-[14.5px] font-bold text-caution">{notPosted.festival} times not posted</p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-amber-900">These are their usual times. They may not apply during {notPosted.festival}.</p>
          {canAdd &&
            (sent ? (
              <p role="status" className="mt-2 text-[13.5px] font-semibold text-emerald-700">
                Thanks! An admin checks them before everyone sees them.
              </p>
            ) : adding ? (
              <AddScheduleBox item={item} festival={notPosted.festival} onSent={() => setSent(true)} onClose={() => setAdding(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-2 h-10 w-full cursor-pointer rounded-[10px] border-[1.5px] border-primary bg-white text-[14.5px] font-bold text-primary hover:bg-primary/5"
              >
                Know their {notPosted.festival} times? Add them
              </button>
            ))}
        </div>
      )}
      {shabbosFirst ? [shabbosBox, weekBox] : [weekBox, shabbosBox]}
      {!week && !shab && (
        <Card title="Davening times" testId="davening-none">
          <p className="pt-0.5 text-[14.5px] text-slate-700">No davening times listed yet.</p>
          {canAdd && updatingIn !== 'none' && updated?.in !== 'none' && (
            <button type="button" onClick={() => open('none')} className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 py-1 text-[14.5px] font-bold text-primary">
              <PlusIcon className="h-4 w-4" />
              Add their times
            </button>
          )}
          {updateIn('none')}
        </Card>
      )}
    </div>
  )
}

/** A week post's times as regular rows, each on its date's weekday, for the
 *  same table and Shabbos lines as the usual times. */
function weekRows(post: SpecialSchedule): Minyan[] {
  return post.minyanim.flatMap((m) => {
    const days = m.on.flatMap((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? [DAY_KEYS[new Date(`${d}T12:00:00Z`).getUTCDay()]] : (DAY_KEYS as readonly string[]).includes(d) ? [d as DayKey] : []))
    if (days.length === 0) return []
    const { on: _on, ...rest } = m
    void _on
    return [{ ...rest, days: [...new Set(days)] }]
  })
}

/** "Shabbos Bereishis, Oct 9–10"; just the dates for a name the guide made
 *  up ("Times for Oct 9 – Oct 10"). */
function postTitle(post: SpecialSchedule): string {
  const from = dateText(post.from)
  const to = dateText(post.to)
  const sameMonth = from.split(' ')[0] === to.split(' ')[0]
  const dates = post.from === post.to ? from : `${from}–${sameMonth ? to.split(' ')[1] : to}`
  return /^times for /i.test(post.name) ? dates : `${post.name}, ${dates}`
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Notes({ lines }: { lines: (string | null | undefined)[] }) {
  const shown = lines.filter((l): l is string => !!l)
  if (shown.length === 0) return null
  return (
    <div className="mt-2 space-y-1 text-[13px] leading-snug text-muted">
      {shown.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  )
}

/** The week as one small table, a column a tefillah, today's row marked. */
function WeekTable({ table, today }: { table: NonNullable<ReturnType<typeof weekdayTable>>; today: DayKey | null }) {
  return (
    <table className="mt-1 w-full text-[14.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }} data-testid="davening-week-table">
      <thead>
        <tr>
          <th className="w-[5.5rem]" />
          {table.columns.map((t) => (
            <th key={t} scope="col" className="px-1.5 pb-1 text-left text-[11.5px] font-extrabold uppercase tracking-wide text-muted">
              {TEFILLAH_LABELS[t]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r) => {
          const isToday = !!today && r.days.includes(today)
          return (
            <tr key={r.label} className={isToday ? 'bg-emerald-50' : undefined} data-today={isToday || undefined}>
              <th scope="row" className="rounded-l-lg py-2 pr-1.5 pl-2 text-left align-top font-bold text-slate-900">
                {r.label}
                {isToday && <span className="block text-[11px] font-extrabold tracking-wide text-emerald-700 uppercase">Today</span>}
              </th>
              {r.cells.map((c, i) => (
                <td key={table.columns[i]} className={`px-1.5 py-2 align-top last:rounded-r-lg ${c === '—' ? 'text-slate-400' : isToday ? 'font-bold text-slate-900' : 'text-slate-900'}`}>
                  {c}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** This week's clock time for a rule, in grey: "this Friday 6:12 PM". Only
 *  where it's this week's: candle lighting and havdalah are the coming
 *  Shabbos's; sunset is today's, so it's given only on the day itself. */
function thisWeek(line: ShabbosLine, anchors: AnchorTimes | undefined, today: DayKey | null): string | null {
  const row = line.row
  if (!row.anchor) return null
  const onDay = line.part === 'friday' ? 'fri' : 'sat'
  if (row.anchor === 'sunset' && today !== onDay) return null
  const at = resolveAnchorTime(row, anchors)
  if (!at) return null
  if (today === onDay) return `${line.part === 'motzei' ? 'Tonight' : 'Today'} ${at}`
  return `${line.part === 'friday' ? 'This Friday' : line.part === 'motzei' ? 'This Motzei Shabbos' : 'This Shabbos'} ${at}`
}

function ShabbosLines({ lines, anchors, today }: { lines: ShabbosLine[]; anchors: AnchorTimes | undefined; today: DayKey | null }) {
  return (
    <div className="divide-y divide-slate-100" data-testid="davening-shabbos-lines">
      {lines.map((l, i) => {
        const first = i === 0 || lines[i - 1].part !== l.part
        const sub = [l.note, thisWeek(l, anchors, today)].filter(Boolean).join(' · ')
        return (
          <div key={`${l.row.id}:${l.part}`} className="flex gap-3 py-2.5">
            <span className="w-[6.5rem] shrink-0 pt-0.5 text-[12px] font-extrabold tracking-wide text-muted uppercase">{first ? SHABBOS_PART_LABELS[l.part] : ''}</span>
            <span className="min-w-0 flex-1 text-[15px] leading-snug">
              <b className="font-bold text-slate-900">{TEFILLAH_LABELS[l.tefillah]}</b> <span className="text-slate-800">{l.when}</span>
              {sub && <span className="mt-0.5 block text-[13px] text-muted">{sub}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Every time in a special schedule, by the days it's held on. */
function SpecialTimes({ schedule }: { schedule: SpecialSchedule }) {
  const groups = new Map<string, SpecialSchedule['minyanim']>()
  for (const m of schedule.minyanim) {
    const label = m.on.map(scheduleDayText).join(', ')
    groups.set(label, [...(groups.get(label) ?? []), m])
  }
  return (
    <div className="mt-1" data-testid="davening-special-all">
      {[...groups].map(([label, rows]) => (
        <div key={label} className="border-t border-slate-100 py-1.5 first:border-t-0">
          <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
          {[...rows]
            .sort((a, b) => TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) || (clockMinutes(a.time) ?? 1440) - (clockMinutes(b.time) ?? 1440))
            .map((m) => {
              const note = noteText(m.notes)
              return (
                <div key={m.id} className="grid grid-cols-[9.5rem_1fr] gap-2.5 py-0.5 text-[15px]">
                  <span className="font-semibold text-slate-900">{TEFILLAH_LABELS[m.tefillah]}</span>
                  <span className="text-slate-900">
                    <b>{timeText(m)}</b>
                    {note ? <span className="text-muted"> · {note}</span> : null}
                  </span>
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}
