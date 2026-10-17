'use client'

import { createContext, useContext } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { isMinyanim, TEFILLAH_LABELS, type Minyan } from '@/lib/davening'
import { readSchedules } from '@/lib/schedules'
import { noteText } from '@/lib/minyanText'
import { clockTime } from '@/lib/upcomingDavening'
import { localParts } from '@/lib/eruv'
import { dayLabel, type DayKey } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { useCommunityTimezone } from '@/lib/communityContext'
import { SignUpButton } from './SignUp'

// ── The minyan you tapped (the user, Oct 16) ────────────────────────────────
// A minyan in Minyanim by time opens its place, where the address, the
// directions and the other times are. It used to open at the top, leaving
// whoever asked for "Mincha 1:45" to find it in the table. Now the place
// opens with that minyan first, in the blue of a search's "Matches your
// search": the day and time, its note, and, for one that only runs when
// enough sign up, where to sign up. With no label over it (the user, Oct
// 16): having just tapped "Mincha 2 PM", "Mincha · Monday 2 PM" says why
// it's there. A search's box needs its label; it can match what wasn't typed.
//
// Carried as `?minyan=<id>~<YYYY-MM-DD>~<minutes>`: the row knows the day
// and the time it showed, which for a time set by sunset only the row
// worked out.

export type TappedMinyan = { itemId: string; minyanId: string; date: string; minutes: number }

export const TappedMinyanContext = createContext<TappedMinyan | null>(null)

/** The `?minyan=` a row in Minyanim by time links its place with. */
export function tappedMinyanParam(minyanId: string, date: string, minutes: number): string {
  return `${minyanId}~${date}~${minutes}`
}

export function parseTappedMinyan(param: string | null | undefined, itemId: string | null | undefined): TappedMinyan | null {
  const m = param?.match(/^(.+)~(\d{4}-\d{2}-\d{2})~(\d{1,4})$/)
  if (!m || !itemId) return null
  const minutes = Number(m[3])
  return minutes < 24 * 60 ? { itemId, minyanId: m[1], date: m[2], minutes } : null
}

/** The minyan tapped to open this listing, if it was. */
export function useTappedMinyan(itemId: string): TappedMinyan | null {
  const tapped = useContext(TappedMinyanContext)
  return tapped?.itemId === itemId ? tapped : null
}

/** The place's minyan by its id: a regular one, or a special schedule's. */
function findMinyan(item: DirectoryResource, category: CategoryConfig, id: string): Pick<Minyan, 'tefillah' | 'notes' | 'signUp'> | null {
  const key = category.detailFields.find((f) => f.type === 'minyanim')?.key
  if (!key) return null
  const regular = isMinyanim(item[key]) ? (item[key] as Minyan[]) : []
  const found = regular.find((m) => m.id === id)
  if (found) return found
  return readSchedules(item[`${key}_schedules`])
    .flatMap((s) => s.minyanim)
    .find((m) => m.id === id) ?? null
}

/** "today", "tomorrow", "Sunday"; nothing before the clock is known, or
 *  for a date more than a week off. */
function dayWord(date: string, now: number | null, tz: string): string | null {
  if (now === null) return null
  const today = localParts(new Date(now), tz).date
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 0 || days > 6) return null
  const weekday = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[new Date(`${date}T12:00:00Z`).getUTCDay()]
  return weekday === 'sat' ? 'Shabbos' : dayLabel(weekday as DayKey)
}

/** At the top of a place opened from a minyan: that minyan. */
export function TappedMinyanBox({ item, category }: { item: DirectoryResource; category: CategoryConfig }) {
  const tapped = useTappedMinyan(item.id)
  const now = useNow()
  const tz = useCommunityTimezone()
  const minyan = tapped ? findMinyan(item, category, tapped.minyanId) : null
  if (!tapped || !minyan) return null
  const day = dayWord(tapped.date, now, tz)
  const note = noteText(minyan.notes)
  return (
    <div className="space-y-1 rounded-lg bg-primary/[0.07] px-3 py-2.5" data-testid="tapped-minyan">
      <p className="text-[16px] font-extrabold text-slate-900">
        {TEFILLAH_LABELS[minyan.tefillah]} · {day ? `${day} ` : ''}
        {clockTime(tapped.minutes)}
      </p>
      {note && <p className="text-sm text-slate-700">{note}</p>}
      {/* One box, in the same blue: where to sign up goes in it, not in a
          second box under the times (the user, Oct 16). */}
      {minyan.signUp && (
        <>
          <p className="text-sm text-slate-700">Check the group first: it only runs on days enough people sign up.</p>
          <SignUpButton signUp={minyan.signUp} />
        </>
      )}
    </div>
  )
}
