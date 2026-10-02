'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import { TEFILLAH_LABELS, TEFILLAH_ORDER, parseTimeToMinutes } from '@/lib/davening'
import { clockTime, listMinyanim } from '@/lib/upcomingDavening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { dayLabel, type DayKey } from '@/lib/hours'
import { dateText, readSchedules, regularMinyanim, scheduleDayText, type DayPosting, type SpecialSchedule } from '@/lib/schedules'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import { ui } from '@/lib/uiConfig'
import { ChevronRightIcon } from '@/components/icons'
import AddScheduleBox from './AddScheduleBox'
import UpdateTimesBox from './UpdateTimesBox'
import DaveningTimes from './DaveningTimes'
import { Card } from './listingParts'
import FreshnessFooter from './FreshnessFooter'

/** Friday night and Shabbos day are what a shul's times are asked about
 *  most, so a Saturday is "Shabbos", not "Saturday". */
function dayName(key: DayKey): string {
  return key === 'sat' ? 'Shabbos' : dayLabel(key)
}

/** A shul's main thing: today's and tomorrow's minyanim, each at its real
 *  time (a candle-lighting Kabbalas Shabbos worked out for today), the ones
 *  already past dimmed; the whole week one tap away. With nothing today or
 *  tomorrow ("Shabbos only" on a Tuesday), the week straight away.
 *
 *  Over a Yom Tov (step 4, agreed Oct 1): the shul's special schedule while
 *  it applies, saying so ("Sukkos schedule · in place of the regular times
 *  until Sun Oct 4"), or, where it hasn't posted one, its regular times
 *  marked "may not apply", with "Know their Sukkos times? Add them".
 *
 *  "Update their times" (agreed Oct 1): paste the shul's new schedule or
 *  this Shabbos's times, or add one time, and see the result to send
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
  const [week, setWeek] = useState(false)
  const [allSpecial, setAllSpecial] = useState(false)
  const [adding, setAdding] = useState(false)
  const [sent, setSent] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updated, setUpdated] = useState<'sent' | 'confirmed' | null>(null)
  const schedule = useMinyanSchedule(null, [item])
  const slots = schedule
    ? listMinyanim(
        schedule.shuls.filter((s) => s.id === item.id),
        { today: schedule.todayDayKeys, tomorrow: schedule.tomorrowDayKeys, season: schedule.season, anchors: schedule.anchors },
      )
    : null
  const soon = slots && slots.today.length + slots.tomorrow.length > 0

  // Whose times today's and tomorrow's are: a special schedule's, or the
  // regular ones on a festival day with none posted.
  const posting: DayPosting[] = schedule ? [schedule.today, schedule.tomorrow].map((d) => schedule.posting[item.id]?.[d.date] ?? { kind: 'regular' }) : []
  const special = posting.find((p): p is Extract<DayPosting, { kind: 'schedule' }> => p.kind === 'schedule')
  const specialSchedule = special ? readSchedules(rawSchedules).find((s) => s.name === special.name) : undefined
  const notPosted = posting.find((p): p is Extract<DayPosting, { kind: 'not-posted' }> => p.kind === 'not-posted')
  const canAdd = ui.contributions.edit && (!category || resolveCapabilities(category.capabilities).edit)

  return (
    <Card title="Davening times" testId="listing-davening" footer={<FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} subject="Times" />}>
      {specialSchedule && (
        <p className="mt-1 text-[13.5px] font-semibold text-green-700" data-testid="davening-special">
          {specialSchedule.name} · {specialSchedule.mode === 'replace' ? 'in place of the regular times' : 'as well as the regular times'} until {dateText(specialSchedule.to, { weekday: true })}
        </p>
      )}
      {notPosted && !specialSchedule && (
        <div className="mt-1.5 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2.5" data-testid="davening-not-posted">
          <p className="text-[14px] font-bold text-caution">{notPosted.festival} times not posted</p>
          <p className="mt-0.5 text-[13px] leading-snug text-amber-900">These are the regular times. They may not apply during {notPosted.festival}.</p>
          {canAdd &&
            (sent ? (
              <p role="status" className="mt-2 text-[13.5px] font-semibold text-emerald-700">
                ✓ Thanks! An admin checks them before everyone sees them.
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
      {soon && !week && schedule && (
        <div>
          {(
            [
              ['today', `Today · ${dayName(schedule.todayKey)}`, slots.today],
              ['tomorrow', `Tomorrow · ${dayName(schedule.tomorrowKey)}`, slots.tomorrow],
            ] as const
          ).map(([key, heading, list]) =>
            list.length === 0 ? null : (
              <div key={key}>
                <p className="mt-2.5 mb-0.5 text-[12.5px] font-bold uppercase tracking-wide text-muted">{heading}</p>
                <dl className="divide-y divide-slate-200/70">
                  {list.map((slot, i) => {
                    const past = key === 'today' && slot.minutes < schedule.nowMinutes
                    return (
                      <div key={`${slot.tefillah}:${slot.minutes}:${i}`} className={`grid grid-cols-[9.5rem_1fr] gap-2.5 py-1.5 text-[15px] ${past ? 'opacity-45' : ''}`}>
                        <dt className="font-semibold text-slate-900">{TEFILLAH_LABELS[slot.tefillah]}</dt>
                        <dd className={past ? 'text-slate-700' : 'font-bold text-slate-900'}>{clockTime(slot.minutes)}</dd>
                      </div>
                    )
                  })}
                </dl>
              </div>
            ),
          )}
        </div>
      )}
      {(week || (slots && !soon)) && (
        <div className="mt-2">
          <DaveningTimes minyanim={minyanim} geo={item.geo} />
        </div>
      )}
      {soon && (
        <button type="button" onClick={() => setWeek((v) => !v)} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[14.5px] font-bold text-primary">
          {week ? 'Today and tomorrow' : 'The whole week'}
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      )}
      {specialSchedule && (
        <div className="mt-1">
          <button type="button" onClick={() => setAllSpecial((v) => !v)} aria-expanded={allSpecial} className="inline-flex cursor-pointer items-center gap-1 text-[14.5px] font-bold text-primary">
            All {specialSchedule.name.replace(/\s+\d{4}$/, '')} times
            <ChevronRightIcon className={`h-4 w-4 transition-transform ${allSpecial ? '-rotate-90' : ''}`} />
          </button>
          {allSpecial && <SpecialTimes schedule={specialSchedule} />}
        </div>
      )}
      {canAdd &&
        (updated ? (
          <p role="status" className="mt-2 text-[13.5px] font-semibold text-emerald-700">
            {updated === 'sent' ? '✓ Thanks! An admin checks them before everyone sees them.' : '✓ Thanks! Marked confirmed.'}
          </p>
        ) : updating ? (
          <UpdateTimesBox
            item={item}
            minyanim={regularMinyanim(minyanim)}
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
              onClick={() => setUpdating(true)}
              className="mt-3 h-10 w-full cursor-pointer rounded-[10px] border-[1.5px] border-primary bg-white text-[14.5px] font-bold text-primary hover:bg-primary/5"
            >
              Update their times
            </button>
          )
        ))}
    </Card>
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
        <div key={label} className="border-t border-slate-200 py-1.5">
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{label}</p>
          {[...rows]
            .sort((a, b) => TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) || parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time))
            .map((m) => (
              <div key={m.id} className="grid grid-cols-[9.5rem_1fr] gap-2.5 py-0.5 text-[15px]">
                <span className="font-semibold text-slate-900">{TEFILLAH_LABELS[m.tefillah]}</span>
                <span className="text-slate-900">
                  <b>{m.time}</b>
                  {m.notes ? <span className="text-muted"> · {m.notes}</span> : null}
                </span>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
