'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { useActiveCommunity } from '@/lib/communityContext'
import { TEFILLAH_LABELS } from '@/lib/davening'
import { milesText } from '@/lib/geo'
import { dayLabel } from '@/lib/hours'
import { clockTime, minyanimOn, type MinyanSlot } from '@/lib/upcomingDavening'
import { dayKeysFor, useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { dateText, type DateFacts, type DayPosting } from '@/lib/schedules'
import { ChevronRightIcon } from '@/components/icons'

// ── The Synagogues page's Minyanim view (step 4, agreed Oct 1) ───────────────
// The same page's shuls, as every minyan by time, for a day picked from the
// week ahead: "Today · Chol HaMoed", "Fri · Hoshana Rabbah", "Shabbos ·
// Shemini Atzeres". An answer first ("Next: Mincha 6:15 PM at…"), then each
// minyan with its shul, how far, and whose times they are: the shul's own
// festival times, or its regular ones marked "Sukkos not posted". On a Yom
// Tov, shuls with nothing posted are folded into one note: their regular
// times are too likely wrong to list as if they applied.
//
// Times are worked out exactly as the shul's card and the Next minyan card
// work them out (useMinyanSchedule), so the three can't disagree.

/** Walking at 25 minutes a mile in a straight line, as the hotel walk lists
 *  reckon it (walkList.ts): from the visitor's location. Otherwise the
 *  rows' own distance from the community's centre. */
function howFar(item: DirectoryResource | undefined): string | null {
  if (!item) return null
  if (item.milesFromAddress != null) return `${Math.max(1, Math.round(item.milesFromAddress * 25))} min walk`
  return item.milesFromCenter != null ? milesText(item.milesFromCenter) : null
}

/** Today and the six days after it: a week, so next Shabbos is always
 *  there, and no further. Past a week, times set by sunset (worked out from
 *  today's) drift, and the calendar's days thin out; a shul's usual times
 *  are on its own page. */
const DAYS_SHOWN = 7

function tabLabel(d: DateFacts, i: number): [string, string] {
  const day = i === 0 ? 'Today' : d.weekday === 'sat' ? 'Shabbos' : dayLabel(d.weekday).slice(0, 3)
  return [day, d.name ?? dateText(d.date)]
}

export default function MinyanimView({
  items,
  categoryId,
  initialDay,
  onHoverShul,
}: {
  items: readonly DirectoryResource[]
  categoryId: string
  initialDay?: string
  /** A row hovered (its shul's id) or left (null): lights the shul's pin on
   *  the map beside the list, as a shul's own row does. */
  onHoverShul?: (shulId: string | null) => void
}) {
  const schedule = useMinyanSchedule(null, items)
  const { community } = useActiveCommunity()
  const [picked, setPicked] = useState<number | null>(null)
  const [earlier, setEarlier] = useState(false)
  const [notPostedOpen, setNotPostedOpen] = useState(false)
  if (!schedule) return <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-slate-100" />

  const days = schedule.week.slice(0, DAYS_SHOWN)
  // Arriving from a link for a weekday ("?day=fri"): that day.
  const fromLink = initialDay ? days.findIndex((d) => initialDay.split(',').includes(d.weekday)) : -1
  const index = picked ?? (fromLink >= 0 ? fromLink : 0)
  const day = days[index]
  const byId = new Map(items.map((i) => [i.id, i]))
  // Each minyan opens its shul's own page; back returns here (?davening=1).
  const hrefOf = (id: string | undefined) => {
    const item = id ? byId.get(id) : undefined
    return item ? routes.listing(community.slug, categoryId, listingSlug(item)) : null
  }
  const postingOf = (id: string | undefined): DayPosting => (id && schedule.posting[id]?.[day.date]) || { kind: 'regular' }

  // On the same minute, the nearer shul first, as the Next minyan card has
  // it (then by name).
  const miles = (s: MinyanSlot) => {
    const item = byId.get(s.shulId ?? '')
    return item?.milesFromAddress ?? item?.milesFromCenter ?? Infinity
  }
  const slots = minyanimOn(schedule.shuls, dayKeysFor(day), schedule.season, schedule.anchors).sort(
    (a, b) => a.minutes - b.minutes || miles(a) - miles(b) || a.shulName.localeCompare(b.shulName),
  )
  // On a Yom Tov, regular times nobody has posted for are folded away.
  const folded = day.yomTov ? slots.filter((s) => postingOf(s.shulId).kind === 'not-posted') : []
  const listed = slots.filter((s) => !folded.includes(s))
  const isToday = index === 0
  const upcoming = isToday ? listed.filter((s) => s.minutes >= schedule.nowMinutes) : listed
  const past = isToday ? listed.filter((s) => s.minutes < schedule.nowMinutes) : []
  const notPostedShuls = [...new Set(folded.map((s) => s.shulName))]

  const festival = day.festival
  const postedCount = festival ? new Set(slots.filter((s) => postingOf(s.shulId).kind === 'schedule').map((s) => s.shulId)).size : 0
  const shulCount = schedule.shuls.length
  const next = upcoming[0]
  const answer = next
    ? `${isToday ? 'Next' : `First on ${tabLabel(day, index)[0] === 'Shabbos' ? 'Shabbos' : dayLabel(day.weekday)}`}: ${TEFILLAH_LABELS[next.tefillah]} ${clockTime(next.minutes)} at ${next.shulName}${howFar(byId.get(next.shulId ?? '')) ? `, ${howFar(byId.get(next.shulId ?? ''))}` : ''}${whose(postingOf(next.shulId), true)}.`
    : notPostedShuls.length
      ? `No shul has posted ${day.name ?? festival} times yet. The regular times of ${notPostedShuls.length} ${notPostedShuls.length === 1 ? 'shul are' : 'shuls are'} below, and may not apply.`
      : isToday && past.length
        ? 'Nothing more today.'
        : 'Nothing listed for this day.'

  return (
    <div data-testid="minyanim-view">
      {/* A week of days: swiped on a phone; on desktop, beside the map,
          they wrap, since a mouse can't swipe and a hidden scrollbar would
          hide the last of them. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 desktop:mx-0 desktop:flex-wrap desktop:overflow-visible desktop:px-0" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="Day">
        {days.map((d, i) => {
          const [a, b] = tabLabel(d, i)
          const on = i === index
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPicked(i)}
              className={`shrink-0 cursor-pointer rounded-xl border-[1.5px] px-3 py-1.5 text-left ${on ? 'border-primary bg-primary/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className={`block text-[14px] font-bold ${on ? 'text-primary' : 'text-slate-900'}`}>{a}</span>
              <span className={`block text-[12px] ${on ? 'text-primary' : 'text-muted'}`}>{b}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-xl bg-primary/[0.07] px-3.5 py-3" data-testid="minyanim-answer">
        <p className="text-[14.5px] font-semibold leading-snug text-slate-900">{answer}</p>
      </div>
      {festival && (
        <p className="mt-2.5 text-[13.5px] leading-snug text-slate-600">
          {day.name ?? festival}. <b>{postedCount} of {shulCount} shuls</b> have posted {festival} times
          {day.yomTov ? '.' : '; the rest show their regular times, marked.'}
        </p>
      )}

      <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100" data-testid="minyanim-rows">
        {upcoming.map((s, i) => (
          <MinyanRow key={`${s.shulId}:${s.tefillah}:${s.minutes}:${i}`} slot={s} far={howFar(byId.get(s.shulId ?? ''))} posting={postingOf(s.shulId)} href={hrefOf(s.shulId)} onHover={onHoverShul} />
        ))}
      </ul>
      {past.length > 0 && (
        <div className="border-t border-slate-100">
          <button type="button" onClick={() => setEarlier((v) => !v)} aria-expanded={earlier} className="flex min-h-11 w-full cursor-pointer items-center gap-1 text-[14px] font-bold text-primary">
            Earlier today · {past.length}
            <ChevronRightIcon className={`h-4 w-4 transition-transform ${earlier ? '-rotate-90' : 'rotate-90'}`} />
          </button>
          {earlier && (
            <ul className="divide-y divide-slate-100 opacity-60">
              {past.map((s, i) => (
                <MinyanRow key={`p:${s.shulId}:${s.tefillah}:${s.minutes}:${i}`} slot={s} far={howFar(byId.get(s.shulId ?? ''))} posting={postingOf(s.shulId)} href={hrefOf(s.shulId)} onHover={onHoverShul} />
              ))}
            </ul>
          )}
        </div>
      )}
      {notPostedShuls.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3" data-testid="minyanim-not-posted">
          <p className="text-[14px] font-bold text-caution">
            Not posted for {day.name ?? festival} · {notPostedShuls.length} {notPostedShuls.length === 1 ? 'shul' : 'shuls'}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-amber-900">
            Their regular times may not apply. {notPostedShuls.slice(0, 3).join(', ')}
            {notPostedShuls.length > 3 && !notPostedOpen ? `, +${notPostedShuls.length - 3}` : ''}
          </p>
          <button type="button" onClick={() => setNotPostedOpen((v) => !v)} className="mt-1 cursor-pointer text-[13.5px] font-bold text-primary">
            {notPostedOpen ? 'Hide their regular times' : 'Their regular times'}
          </button>
          {notPostedOpen && (
            <ul className="mt-1 divide-y divide-amber-200">
              {folded.map((s, i) => (
                <MinyanRow key={`n:${s.shulId}:${s.tefillah}:${s.minutes}:${i}`} slot={s} far={howFar(byId.get(s.shulId ?? ''))} posting={postingOf(s.shulId)} href={hrefOf(s.shulId)} onHover={onHoverShul} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** ", its Sukkos times", or ", regular times · Sukkos not posted". */
function whose(p: DayPosting, inSentence = false): string {
  if (p.kind === 'schedule') return inSentence ? `, its ${p.name.replace(/\s+\d{4}$/, '')} times` : `${p.name.replace(/\s+\d{4}$/, '')} times`
  if (p.kind === 'not-posted') return inSentence ? `, regular times (${p.festival} not posted)` : `Regular times · ${p.festival} not posted`
  return ''
}

function MinyanRow({
  slot,
  far,
  posting,
  href,
  onHover,
}: {
  slot: MinyanSlot
  far: string | null
  posting: DayPosting
  href: string | null
  onHover?: (shulId: string | null) => void
}) {
  const tag = whose(posting)
  const body = (
    <>
        <span className="w-[4.5rem] shrink-0 text-[16.5px] font-extrabold text-slate-900">{clockTime(slot.minutes)}</span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold text-slate-900">{slot.shulName}</span>
          <span className="block text-[13.5px] text-slate-600">
            {TEFILLAH_LABELS[slot.tefillah]}
            {slot.notes ? ` · ${slot.notes}` : ''}
            {far ? ` · ${far}` : ''}
          </span>
          {tag && (
            <span className={`mt-0.5 block text-[13px] font-semibold ${posting.kind === 'schedule' ? 'text-green-700' : 'text-caution'}`} data-testid="minyan-whose">
              {posting.kind === 'schedule' ? '✓ ' : '⚠ '}
              {tag}
            </span>
          )}
        </span>
    </>
  )
  const row = 'flex w-full gap-3 py-2.5 text-left hover:bg-slate-50'
  return (
    <li onMouseEnter={onHover && slot.shulId ? () => onHover(slot.shulId!) : undefined} onMouseLeave={onHover ? () => onHover(null) : undefined}>
      {href ? (
        <Link href={href} className={row}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  )
}
