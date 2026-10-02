'use client'

import { useEffect, useRef, useState } from 'react'
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
import { dayIndexFor, readMinyanimSearch, shulMatches, tefillosLabel } from '@/lib/minyanimSearch'
import AddMinyanSheet from './AddMinyanSheet'
import AddScheduleBox from './AddScheduleBox'

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
  search = '',
  canAdd = false,
  minyanimKey = 'minyanim',
  shulText = () => '',
}: {
  items: readonly DirectoryResource[]
  categoryId: string
  initialDay?: string
  /** A row hovered (its shul's id) or left (null): lights the shul's pin on
   *  the map beside the list, as a shul's own row does. */
  onHoverShul?: (shulId: string | null) => void
  /** What's typed in the tab's search ("mincha", "shabbos", "mekor"): it
   *  narrows the minyanim, and a day typed picks that day (the user's note
   *  4, agreed Oct 2; see minyanimSearch.ts). */
  search?: string
  /** Whether minyanim can be added here: "+ Add a minyan" as the list's
   *  last row, and "Add their times" for a shul that hasn't posted. */
  canAdd?: boolean
  minyanimKey?: string
  /** A shul's pick-list values ("Orthodox (Ashkenazi)"): searched, and
   *  shown when choosing a shul to add a minyan to. */
  shulText?: (item: DirectoryResource) => string
}) {
  const schedule = useMinyanSchedule(null, items)
  const { community } = useActiveCommunity()
  // A day tapped wins over a day typed until the search changes again.
  const [picked, setPicked] = useState<{ index: number; search: string } | null>(null)
  const [earlier, setEarlier] = useState(false)
  const [notPostedOpen, setNotPostedOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addingTimes, setAddingTimes] = useState<string | null>(null)
  const [sentTimes, setSentTimes] = useState<string[]>([])
  const sought = readMinyanimSearch(search)
  if (!schedule) return <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-slate-100" />

  const days = schedule.week.slice(0, DAYS_SHOWN)
  // Arriving from a link for a weekday ("?day=fri"): that day.
  const fromLink = initialDay ? days.findIndex((d) => initialDay.split(',').includes(d.weekday)) : -1
  const typedDay = dayIndexFor(sought?.when ?? null, days)
  const index = picked && (picked.search === search || typedDay < 0) ? picked.index : typedDay >= 0 ? typedDay : fromLink >= 0 ? fromLink : 0
  const day = days[index]
  const byId = new Map(items.map((i) => [i.id, i]))
  // The shuls the search names ("mekor", "orthodox"), or all of them.
  const named = sought?.terms.length ? items.filter((i) => shulMatches(i, sought.terms, shulText(i))) : null
  const namedIds = named ? new Set(named.map((i) => i.id)) : null
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
  const asked = sought?.tefillos ?? null
  const slots = minyanimOn(schedule.shuls, dayKeysFor(day), schedule.season, schedule.anchors)
    .filter((s) => (!asked || asked.includes(s.tefillah)) && (!namedIds || namedIds.has(s.shulId ?? '')))
    .sort((a, b) =>
      // "Maariv near me": the nearest first.
      sought?.nearMe
        ? miles(a) - miles(b) || a.minutes - b.minutes
        : a.minutes - b.minutes || miles(a) - miles(b) || a.shulName.localeCompare(b.shulName),
    )
  // On a Yom Tov, regular times nobody has posted for are folded away.
  const folded = day.yomTov ? slots.filter((s) => postingOf(s.shulId).kind === 'not-posted') : []
  const listed = slots.filter((s) => !folded.includes(s))
  const isToday = index === 0
  const upcoming = isToday ? listed.filter((s) => s.minutes >= schedule.nowMinutes) : listed
  const past = isToday ? listed.filter((s) => s.minutes < schedule.nowMinutes) : []
  const notPostedShuls = [...new Set(folded.map((s) => s.shulName))]
  const notPostedIds = [...new Set(folded.map((s) => s.shulId).filter((id): id is string => !!id))]

  const festival = day.festival
  const postedCount = festival ? new Set(slots.filter((s) => postingOf(s.shulId).kind === 'schedule').map((s) => s.shulId)).size : 0
  const shulCount = schedule.shuls.length
  const next = upcoming[0]
  // "Mincha on Friday"; "Minyanim Shabbos morning" when a part of the day
  // was typed, which says it better than "Shacharis & Shabbos Mussaf".
  const partOfDay = sought && !sought.named && sought.when?.tefillos ? sought.when.label : null
  const dayWord = partOfDay ?? (isToday ? 'today' : `on ${tabLabel(day, index)[0] === 'Shabbos' ? 'Shabbos' : dayLabel(day.weekday)}`)
  const label = sought?.named ? tefillosLabel(asked) : 'Minyanim'
  const lead = partOfDay && !sought?.named ? partOfDay[0].toUpperCase() + partOfDay.slice(1) : `${label} ${dayWord}`
  const far = (s: MinyanSlot) => howFar(byId.get(s.shulId ?? ''))
  // A search answers what it asked: "Mincha on Friday: first 6:23 PM at…".
  const searchedAnswer = !sought
    ? null
    : named && named.length === 0
      ? `No shul in the guide matches “${search.trim()}”.`
      : next
        ? sought.nearMe
          ? `${lead}, nearest first: ${next.shulName}${far(next) ? `, ${far(next)}` : ''}, at ${clockTime(next.minutes)}${whose(postingOf(next.shulId), true)}.${upcoming.length > 1 ? ` ${upcoming.length - 1} more.` : ''}`
          : `${lead}: first ${clockTime(next.minutes)} at ${next.shulName}${far(next) ? `, ${far(next)}` : ''}${whose(postingOf(next.shulId), true)}.${upcoming.length > 1 ? ` ${upcoming.length - 1} more.` : ''}`
        : notPostedShuls.length
          ? `No shul has posted ${day.name ?? festival} times yet. The regular times of ${notPostedShuls.length} ${notPostedShuls.length === 1 ? 'shul are' : 'shuls are'} below, and may not apply.`
          : isToday && past.length
            ? `No more ${label === 'Minyanim' ? 'minyanim' : label} today.`
            : `No ${label === 'Minyanim' ? 'minyanim' : label} listed ${dayWord}.`
  // The one shul the search named, for adding a minyan to it.
  const oneShul = named?.length === 1 ? named[0].id : undefined
  const addLabel = `Add ${sought?.named ? `a ${label}` : 'a minyan'} on ${tabLabel(day, index)[0] === 'Today' ? dayLabel(day.weekday).slice(0, 3) : tabLabel(day, index)[0]}${day.name ? ` · ${day.name}` : ''}`
  const answer = searchedAnswer ?? (next
    ? `${isToday ? 'Next' : `First on ${tabLabel(day, index)[0] === 'Shabbos' ? 'Shabbos' : dayLabel(day.weekday)}`}: ${TEFILLAH_LABELS[next.tefillah]} ${clockTime(next.minutes)} at ${next.shulName}${howFar(byId.get(next.shulId ?? '')) ? `, ${howFar(byId.get(next.shulId ?? ''))}` : ''}${whose(postingOf(next.shulId), true)}.`
    : notPostedShuls.length
      ? `No shul has posted ${day.name ?? festival} times yet. The regular times of ${notPostedShuls.length} ${notPostedShuls.length === 1 ? 'shul are' : 'shuls are'} below, and may not apply.`
      : isToday && past.length
        ? 'Nothing more today.'
        : 'Nothing listed for this day.')

  return (
    <div data-testid="minyanim-view">
      <DayTabs days={days} index={index} onPick={(i) => setPicked({ index: i, search })} />

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
        {/* Adding a minyan where the minyanim are, as the list's last row
            (the user's note 2): on the day being looked at. */}
        {canAdd && (
          <li>
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 w-full cursor-pointer items-center gap-3 py-2.5 text-left hover:bg-slate-50" data-testid="add-minyan">
              <span className="flex w-[4.5rem] shrink-0 text-primary" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-[18px] w-[18px]">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="text-[15px] font-bold text-primary">{addLabel}</span>
            </button>
          </li>
        )}
      </ul>
      {canAdd && adding && (
        <AddMinyanSheet
          isOpen
          onClose={() => setAdding(false)}
          shuls={items}
          day={day}
          shulId={oneShul}
          tefillah={sought?.named && (asked?.length === 1 || (asked?.length === 2 && asked.includes('mincha_maariv'))) ? asked?.find((t) => t !== 'mincha_maariv') : undefined}
          minyanimKey={minyanimKey}
          shulText={shulText}
        />
      )}
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
          {canAdd ? (
            <>
              <p className="mt-0.5 text-[13px] leading-snug text-amber-900">Their regular times may not apply. Have a shul’s message or flyer? Add it here.</p>
              <ul className="mt-1.5" data-testid="not-posted-shuls">
                {(notPostedOpen ? notPostedIds : notPostedIds.slice(0, 4)).map((id) => {
                  const shul = byId.get(id)
                  if (!shul) return null
                  const festivalOf = postingOf(id)
                  return (
                    <li key={id} className="border-t border-amber-200 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[14px] text-amber-900">
                          <b className="text-slate-900">{shul.name}</b>
                          {howFar(shul) ? ` · ${howFar(shul)}` : ''}
                        </span>
                        {sentTimes.includes(id) ? (
                          <span className="shrink-0 text-[13px] font-semibold text-emerald-700">✓ Sent</span>
                        ) : (
                          addingTimes !== id && (
                            <button type="button" onClick={() => setAddingTimes(id)} className="shrink-0 cursor-pointer text-[13.5px] font-bold text-primary hover:underline">
                              Add their times
                            </button>
                          )
                        )}
                      </div>
                      {addingTimes === id && festivalOf.kind === 'not-posted' && (
                        <AddScheduleBox
                          item={shul}
                          festival={festivalOf.festival}
                          onSent={() => {
                            setSentTimes((ids) => [...ids, id])
                            setAddingTimes(null)
                          }}
                          onClose={() => setAddingTimes(null)}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className="mt-0.5 text-[13px] leading-snug text-amber-900">
              Their regular times may not apply. {notPostedShuls.slice(0, 3).join(', ')}
              {notPostedShuls.length > 3 && !notPostedOpen ? `, +${notPostedShuls.length - 3}` : ''}
            </p>
          )}
          <button type="button" onClick={() => setNotPostedOpen((v) => !v)} className="mt-1 cursor-pointer text-[13.5px] font-bold text-primary">
            {notPostedOpen ? 'Hide their regular times' : canAdd && notPostedIds.length > 4 ? `+${notPostedIds.length - 4} more shuls · their regular times` : 'Their regular times'}
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

/** The week's days, on one line. A phone swipes it; desktop, where a mouse
 *  can't swipe, gets arrows at the ends while there's more to see. The
 *  day picked (or typed) is kept in view. */
function DayTabs({ days, index, onPick }: { days: readonly DateFacts[]; index: number; onPick: (i: number) => void }) {
  const row = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = () => {
    const el = row.current
    if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(() => {
    const el = row.current
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el && tab && (tab.offsetLeft < el.scrollLeft || tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth)) {
      el.scrollTo?.({ left: tab.offsetLeft - 16, behavior: 'smooth' })
    }
    measure()
  }, [index])
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const step = (dir: 1 | -1) => row.current?.scrollBy?.({ left: dir * 220, behavior: 'smooth' })
  const arrow = 'absolute top-0 bottom-1 hidden w-10 cursor-pointer items-center text-primary desktop:flex'
  return (
    <div className="relative">
      <div ref={row} onScroll={measure} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 desktop:mx-0 desktop:px-0" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="Day">
        {days.map((d, i) => {
          const [a, b] = tabLabel(d, i)
          const on = i === index
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPick(i)}
              className={`shrink-0 cursor-pointer rounded-xl border-[1.5px] px-3 py-1.5 text-left ${on ? 'border-primary bg-primary/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className={`block text-[14px] font-bold ${on ? 'text-primary' : 'text-slate-900'}`}>{a}</span>
              <span className={`block whitespace-nowrap text-[12px] ${on ? 'text-primary' : 'text-muted'}`}>{b}</span>
            </button>
          )
        })}
      </div>
      {more.left && (
        <button type="button" onClick={() => step(-1)} aria-label="Earlier days" className={`${arrow} left-0 justify-start bg-gradient-to-r from-white via-white/90 to-transparent`}>
          <ChevronRightIcon className="h-5 w-5 rotate-180" />
        </button>
      )}
      {more.right && (
        <button type="button" onClick={() => step(1)} aria-label="Later days" className={`${arrow} right-0 justify-end bg-gradient-to-l from-white via-white/90 to-transparent`}>
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
