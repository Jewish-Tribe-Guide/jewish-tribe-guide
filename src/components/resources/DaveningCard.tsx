'use client'

import { useState } from 'react'
import type { DirectoryResource } from '@/types'
import { TEFILLAH_LABELS } from '@/lib/davening'
import { clockTime, listMinyanim } from '@/lib/upcomingDavening'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { dayLabel, type DayKey } from '@/lib/hours'
import { ChevronRightIcon } from '@/components/icons'
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
 *  tomorrow ("Shabbos only" on a Tuesday), the week straight away. */
export default function DaveningCard({ item, minyanim }: { item: DirectoryResource; minyanim: unknown }) {
  const [week, setWeek] = useState(false)
  const schedule = useMinyanSchedule(null, [item])
  const slots = schedule
    ? listMinyanim(
        schedule.shuls.filter((s) => s.id === item.id),
        { today: schedule.todayDayKeys, tomorrow: schedule.tomorrowDayKeys, season: schedule.season, anchors: schedule.anchors },
      )
    : null
  const soon = slots && slots.today.length + slots.tomorrow.length > 0

  return (
    <Card title="Davening times" testId="listing-davening" footer={<FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} subject="Times" />}>
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
    </Card>
  )
}
