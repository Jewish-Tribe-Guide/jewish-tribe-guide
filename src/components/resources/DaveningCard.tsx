'use client'

import { useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { TEFILLAH_LABELS, TEFILLAH_ORDER } from '@/lib/davening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { geoKey, geoOrCommunityDefault, resolveAnchorTime, type AnchorTimes } from '@/lib/useZmanAnchors'
import { dateText, readSchedules, regularMinyanim, scheduleDayText, type DayPosting, type SpecialSchedule } from '@/lib/schedules'
import { clockMinutes, noteText, SHABBOS_PART_LABELS, shabbosList, timeText, weekdayTable, type ShabbosLine } from '@/lib/weekTable'
import type { DayKey } from '@/lib/hours'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'
import { ChevronRightIcon, PlusIcon } from '@/components/icons'
import AddScheduleBox from './AddScheduleBox'
import UpdateTimesBox from './UpdateTimesBox'
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
  const [updating, setUpdating] = useState(false)
  const [updated, setUpdated] = useState<'sent' | 'confirmed' | null>(null)
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({})
  const schedule = useMinyanSchedule(null, [item])
  const canAdd = ui.contributions.edit && (!category || resolveCapabilities(category.capabilities).edit)

  // Whose times today's and tomorrow's are: a special schedule's, or the
  // regular ones on a festival day with none posted.
  const posting: DayPosting[] = schedule ? [schedule.today, schedule.tomorrow].map((d) => schedule.posting[item.id]?.[d.date] ?? { kind: 'regular' }) : []
  const special = posting.find((p): p is Extract<DayPosting, { kind: 'schedule' }> => p.kind === 'schedule')
  const specialSchedule = special ? readSchedules(rawSchedules).find((s) => s.name === special.name) : undefined
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
  // A schedule in place of the usual times folds them to one line.
  const replaced = specialSchedule?.mode === 'replace'

  const update = () => setUpdating(true)
  const updateArea = canAdd && (
    <div className="mt-2.5">
      {updated ? (
        <p role="status" className="text-[13.5px] font-semibold text-emerald-700">
          {updated === 'sent' ? 'Thanks! An admin checks them before everyone sees them.' : 'Thanks! Marked confirmed.'}
        </p>
      ) : updating ? (
        <UpdateTimesBox
          item={item}
          minyanim={rows}
          onSent={(what) => {
            setUpdated(what)
            setUpdating(false)
          }}
          onClose={() => setUpdating(false)}
        />
      ) : (
        !adding && (
          <button
            type="button"
            onClick={update}
            className="h-10 w-full cursor-pointer rounded-[10px] border-[1.5px] border-primary bg-white text-[14.5px] font-bold text-primary hover:bg-primary/5"
          >
            Update their times
          </button>
        )
      )}
    </div>
  )
  const confirm = <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} subject="Times" />

  const folded = (key: string, title: string, body: ReactNode) =>
    replaced && !unfolded[key] ? (
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
          <span className="mt-0.5 block text-[13.5px] text-muted">Not now: the {specialSchedule!.name} times above replace them</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 rotate-90 text-slate-400" />
      </button>
    ) : (
      body
    )

  const weekBox = week
    ? folded(
        'week',
        'Usual weekday times',
        <Card key="week" title="Usual weekday times" testId="davening-weekday">
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
        </Card>,
      )
    : shab && (
        <p key="week" className="px-1 text-[13.5px] text-muted" data-testid="davening-no-weekday">
          No weekday minyan listed.{' '}
          {canAdd && (
            <button type="button" onClick={update} className="cursor-pointer font-bold text-primary hover:underline">
              Add one
            </button>
          )}
        </p>
      )

  const shabbosBox = shab
    ? folded(
        'shabbos',
        'Usual Shabbos times',
        <Card key="shabbos" title="Usual Shabbos times" testId="davening-shabbos">
          <ShabbosLines lines={shab.lines} anchors={anchors} today={today} />
          <Notes lines={[shab.otherSeason]} />
        </Card>,
      )
    : week && (
        <Card key="shabbos" title="Usual Shabbos times" testId="davening-shabbos">
          <p className="pt-0.5 text-[14.5px] leading-relaxed text-slate-700">Their Shabbos times aren’t listed yet.{canAdd ? ' If you’ve davened there, add them.' : ''}</p>
          {canAdd && (
            <button type="button" onClick={update} className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 py-1 text-[14.5px] font-bold text-primary">
              <PlusIcon className="h-4 w-4" />
              Add their Shabbos times
            </button>
          )}
        </Card>
      )

  return (
    <div className="space-y-5" data-testid="listing-davening">
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
        </Card>
      )}
      {/* One date and one Update for the shul's times, for now; each box
          gets its own with migration 072. */}
      <Card testId="davening-confirm" footer={confirm}>
        {updateArea}
      </Card>
    </div>
  )
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
