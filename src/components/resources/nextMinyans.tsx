'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { useMinyanSchedule } from '@/lib/useMinyanSchedule'
import { nextMinyanByShul } from '@/lib/upcomingDavening'

// ── Each shul's next minyan, for its row ─────────────────────────────────────
// "Mincha 6:34 PM" on a shul's row (see nextMinyanByShul). Worked out once
// for the whole list and handed down, rather than by every row.

export const NextMinyansContext = createContext<Record<string, string>>({})

/** This listing's next minyan, when it's a shul in a list that has them. */
export function useNextMinyan(id: string): string | null {
  return useContext(NextMinyansContext)[id] ?? null
}

/** Wraps a list of listings. Only a shul category (`enabled`) works anything
 *  out: minyan times fetch sunset times, which a food or grocery page has no
 *  use for. */
export function NextMinyans({ enabled, items, children }: { enabled: boolean; items: readonly DirectoryResource[]; children: ReactNode }) {
  return enabled ? <Worked items={items}>{children}</Worked> : <>{children}</>
}

function Worked({ items, children }: { items: readonly DirectoryResource[]; children: ReactNode }) {
  const { shuls, anchors, todayDayKeys, tomorrowKey, nowMinutes, season } = useMinyanSchedule(null, items)
  const next = nextMinyanByShul(shuls, { today: todayDayKeys, tomorrow: [tomorrowKey], nowMinutes, season, anchors })
  return <NextMinyansContext.Provider value={next}>{children}</NextMinyansContext.Provider>
}
