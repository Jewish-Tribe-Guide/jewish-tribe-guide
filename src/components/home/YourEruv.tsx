'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRightIcon } from '@/components/icons'
import { useOptionalLocation } from '@/lib/locationContext'
import { eruvView, type EruvTone } from '@/lib/eruv'
import { useEruvStatuses } from '@/lib/useEruvStatuses'
import { locator } from '@/lib/eruvShape'

// ── "Your eruv", on the Friday home (Oct 7, canvas board 5) ─────────────────
// Erev Shabbos or Yom Tov, with a location set: the eruv the visitor is in
// (or at the edge of), whether it's up, and when the guide checked. Tapping
// it opens the Eruv page, map first. Nothing when there's no location, no
// eruv line around them, or the eruv table isn't there yet.

const DOT: Record<EruvTone, string> = { green: 'bg-green-700', amber: 'bg-amber-700', red: 'bg-red-700', grey: 'bg-slate-500' }
const WORDS: Record<EruvTone, string> = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700', grey: 'text-slate-700' }

export default function YourEruv({ communitySlug, href, now }: { communitySlug: string; href: string; now: number }) {
  const location = useOptionalLocation()
  const you = location?.coords ?? null
  const accuracy = location?.accuracyM ?? null
  const statuses = useEruvStatuses(communitySlug, !!you)
  const loaded = statuses?.available ? statuses : null

  const found = useMemo(() => {
    if (!loaded || !you) return null
    const where = loaded.eruvim.filter((e) => e.line?.lines.length).map((e) => ({ eruv: e, where: locator(e.line!)([you.lat, you.lng], accuracy) }))
    return where.find((w) => w.where === 'inside') ?? where.find((w) => w.where === 'edge') ?? null
  }, [loaded, you, accuracy])

  if (!loaded || !found) return null
  const view = eruvView(found.eruv, new Date(now), loaded.timezone, loaded.candles)
  return (
    <Link href={href} prefetch={false} data-wide data-testid="today-eruv" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-extrabold tracking-[0.06em] text-muted">YOUR ERUV</span>
        <span className="mt-0.5 block text-[17px] font-extrabold text-slate-900">{found.where === 'inside' ? found.eruv.name : `At the edge of the ${found.eruv.name}`}</span>
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
