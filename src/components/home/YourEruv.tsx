'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRightIcon } from '@/components/icons'
import { useOptionalLocation } from '@/lib/locationContext'
import { eruvView, type EruvTone } from '@/lib/eruv'
import { useEruvMaps, useEruvStatuses } from '@/lib/useEruvStatuses'
import { metresFrom } from '@/lib/eruvShape'

// ── The nearest eruv, on the Friday home (Oct 7, canvas board 5) ────────────
// Erev Shabbos or Yom Tov, with a location set: the eruv whose line is
// nearest the visitor, whether it's up, and when the guide checked.
// Tapping it opens the Eruv page, map first, where they see their dot on
// the eruv's own map. It doesn't say they're inside it (Oct 12: the guide
// no longer works that out; the user: people look at the map). Nothing
// when there's no location, no eruv within reach, or the eruv table isn't
// there yet.

const DOT: Record<EruvTone, string> = { green: 'bg-green-700', amber: 'bg-amber-700', red: 'bg-red-700', grey: 'bg-slate-500' }
const WORDS: Record<EruvTone, string> = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-700' }

/** Further than this from every eruv's line, there's no eruv to name. */
const REACH_M = 5_000

export default function YourEruv({ communitySlug, href, now }: { communitySlug: string; href: string; now: number }) {
  const you = useOptionalLocation()?.coords ?? null
  const statuses = useEruvStatuses(communitySlug, !!you)
  const loaded = statuses?.available ? statuses : null
  const maps = useEruvMaps(communitySlug, !!loaded)

  const nearest = useMemo(() => {
    if (!loaded || !maps || !you) return null
    const by = loaded.eruvim.flatMap((e) => (maps.get(e.id) ? [{ eruv: e, m: metresFrom(maps.get(e.id)!, [you.lat, you.lng]) }] : []))
    const best = by.reduce<(typeof by)[number] | null>((a, b) => (!a || b.m < a.m ? b : a), null)
    return best && best.m <= REACH_M ? best.eruv : null
  }, [loaded, maps, you])

  if (!loaded || !nearest) return null
  const view = eruvView(nearest, new Date(now), loaded.timezone, loaded.candles)
  return (
    <Link href={href} prefetch={false} data-wide data-testid="today-eruv" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-extrabold tracking-[0.06em] text-muted">NEAREST ERUV</span>
        <span className="mt-0.5 block text-[17px] font-extrabold text-slate-900">{nearest.name}</span>
        <span className="mt-1 flex items-baseline gap-2">
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[view.tone]}`} />
          <span className={`text-[15px] font-extrabold ${WORDS[view.tone]}`}>{view.label}</span>
        </span>
        {view.checked && <span className="mt-0.5 block text-[13px] text-muted">{view.checked}</span>}
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  )
}
