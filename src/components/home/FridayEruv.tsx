'use client'

import Link from 'next/link'
import { eruvView, type EruvTone } from '@/lib/eruv'
import { eruvSummary } from '@/lib/phoneHome'
import { ChevronRightIcon } from '@/components/icons'
import { useNearestEruv } from './YourEruv'

// ── The eruv, on the Friday card (the user, Oct 17) ─────────────────────────
// One line inside the candles card, where an Eruv button was: the answer
// rather than a way to it. Someone who has said where they are sees the
// eruv nearest them, by name ("Center City Eruv · Up for this Shabbos ·
// Checked 1:25 PM"); everyone else, all of them counted ("Eruvim · 3 up ·
// 2 by phone"), with one that's down named first, in red. It opens the
// Eruv page, or that eruv on it. Every line says "eruv", so there's no
// title over it. On Shabbos it stays, as of the last check before candles.

/** On the card's dark ground: the Eruv page's tones, lighter. */
const DOT: Record<EruvTone, string> = { green: 'bg-green-400', amber: 'bg-amber-400', red: 'bg-red-400', grey: 'bg-slate-400' }
const WORDS: Record<EruvTone, string> = { green: 'text-green-300', amber: 'text-amber-300', red: 'text-red-300', grey: 'text-slate-300' }

const rowClass = 'mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2.5 hover:bg-white/[0.13]'

export default function FridayEruv({ communitySlug, href, now }: { communitySlug: string; href: string; now: number }) {
  const { statuses, loaded, nearest, pending } = useNearestEruv(communitySlug)
  // Its height, held, until there's something to say.
  if (statuses === null || pending) return <div aria-hidden="true" className="mt-3 h-[46px] rounded-xl bg-white/[0.06]" />
  // The statuses couldn't be had: still the way to the Eruv page.
  if (!loaded || loaded.eruvim.length === 0) {
    return (
      <Link href={href} prefetch={false} data-testid="today-eruv" className={rowClass}>
        <span className="min-w-0 flex-1 text-[14.5px] font-bold text-white">Eruvim</span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
      </Link>
    )
  }
  const at = new Date(now)
  // With a location, or with only one eruv, that eruv by name.
  const one = nearest ?? (loaded.eruvim.length === 1 ? loaded.eruvim[0] : null)
  if (one) {
    const view = eruvView(one, at, loaded.timezone, loaded.candles)
    // "Checked 1:25 PM", without the Eruv page's "every 15 minutes …".
    const checked = view.checked?.split(' · ')[0]
    return (
      <Link href={`${href}?item=${encodeURIComponent(one.id)}`} prefetch={false} data-testid="today-eruv" className={rowClass}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 text-[14.5px] font-bold text-white">
            <Dot tone={view.tone} />
            {one.name}
            <span className={`font-bold ${WORDS[view.tone]}`}>{view.label}</span>
          </span>
          {view.tone === 'grey' && one.hotline ? (
            <span className="block text-[12.5px] text-slate-300">Hotline {one.hotline}</span>
          ) : (
            checked && <span className="block text-[12.5px] tabular-nums text-slate-300">{checked}</span>
          )}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
      </Link>
    )
  }
  const summary = eruvSummary(loaded.eruvim, at, loaded.timezone, loaded.candles)
  if (!summary) return null
  const parts = summary.parts.map((p) => (
    <span key={p.text} className="inline-flex items-baseline gap-1.5">
      <Dot tone={p.tone} />
      {p.text}
    </span>
  ))
  return (
    <Link href={href} prefetch={false} data-testid="today-eruv" className={rowClass}>
      <span className="min-w-0 flex-1">
        {summary.down && (
          <span className="flex items-baseline gap-1.5 text-[14.5px] font-extrabold text-red-300">
            <Dot tone="red" />
            {summary.down}
          </span>
        )}
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13.5px] font-semibold text-slate-200">
          {!summary.down && <span className="text-[14.5px] font-bold text-white">Eruvim</span>}
          {parts}
        </span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
    </Link>
  )
}

function Dot({ tone }: { tone: EruvTone }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 -translate-y-px rounded-full ${DOT[tone]}`} />
}
