'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { shulRowByShul, type ShulRowStatus } from '@/lib/upcomingDavening'

// ── Each shul's davening, for its row ────────────────────────────────────────
// "Mincha 6:34 PM", or "Shabbos only", on a shul's row, with the shul's own
// note for its third line (see shulRowByShul). Worked out once for the
// whole list and handed down, rather than by every row.

export const NextMinyansContext = createContext<Record<string, ShulRowStatus>>({})

/** This listing's davening, when it's a shul in a list that has them. */
export function useNextMinyan(id: string): ShulRowStatus | null {
  return useContext(NextMinyansContext)[id] ?? null
}

/** Wraps a list of listings. Only a shul category (`enabled`) works anything
 *  out: minyan times fetch sunset times, which a food or grocery page has no
 *  use for. */
export function NextMinyans({ enabled, items, children }: { enabled: boolean; items: readonly DirectoryResource[]; children: ReactNode }) {
  return enabled ? <Worked items={items}>{children}</Worked> : <>{children}</>
}

function Worked({ items, children }: { items: readonly DirectoryResource[]; children: ReactNode }) {
  // Null until the page has hydrated (see useNow): the rows say nothing
  // about davening until then.
  const schedule = useMinyanSchedule(null, items)
  const next: Record<string, ShulRowStatus> = {}
  if (schedule) {
    const { shuls, anchors, todayDayKeys, tomorrowDayKeys, nowMinutes, season } = schedule
    Object.assign(next, shulRowByShul(shuls, { today: todayDayKeys, tomorrow: tomorrowDayKeys, nowMinutes, season, anchors }))
    // A shul with no times at all isn't among `shuls`, which only holds shuls
    // with minyanim to schedule, but its row still says so.
    for (const item of items) {
      if (!(item.id in next) && !shuls.some((s) => s.id === item.id)) next[item.id] = { text: 'No davening times listed', tone: 'quiet' }
    }
  }
  return <NextMinyansContext.Provider value={next}>{children}</NextMinyansContext.Provider>
}
