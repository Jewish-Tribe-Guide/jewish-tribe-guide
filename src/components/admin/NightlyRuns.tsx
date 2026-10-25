'use client'

import Link from 'next/link'
import { useState } from 'react'
import { kindBad, lastNightLine, type KindNight, type NightKindView } from '@/lib/nightKinds'

// ── The Watches tab's "Last night" (Oct 25, FinalNightly) ───────────────────
// A row that says whether everything was read last night, or which kinds
// weren't. Opened, a line per kind of source (nightKinds.ts): its run's
// time and what it read. A kind opens to what it reads, what wasn't read
// last night and why, each a link to its job page, and its last 14 nights.

export type NightlyRunsLoaded = { available: boolean; kinds: NightKindView[] }

function Chevron({ open, size = 16, className = '' }: { open: boolean; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={`shrink-0 text-slate-400 ${className}`}>
      <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
    </svg>
  )
}

const NIGHT_TONE: Record<KindNight['tone'], string> = {
  good: 'text-slate-600',
  bad: 'font-semibold text-amber-800',
  none: 'text-slate-400',
}

function CountLine({ kind }: { kind: NightKindView }) {
  return kindBad(kind) ? (
    <span className="block text-[13.5px] font-semibold text-amber-800">{[kind.count, kind.trouble].filter(Boolean).join(' · ')}</span>
  ) : (
    <span className="block text-[13.5px] text-slate-600">{kind.count}</span>
  )
}

function KindRow({ kind, base }: { kind: NightKindView; base: string }) {
  const [open, setOpen] = useState(false)
  const page = (p: string) => (p ? `${base}/watches/${p}` : `${base}/watches`)
  return (
    <li className="border-t border-slate-100" data-testid="night-kind">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full cursor-pointer items-start gap-2.5 px-3.5 py-3 text-left">
        {open && <Chevron open className="mt-0.5" />}
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex justify-between gap-2">
            <span className="text-[15px] font-bold text-slate-900">{kind.name}</span>
            {kind.when && <span className="whitespace-nowrap text-[12.5px] text-slate-500">{kind.when}</span>}
          </span>
          <CountLine kind={kind} />
        </span>
        {!open && <Chevron open={false} className="self-center" />}
      </button>
      {open && (
        <div className="pb-1.5">
          <p className="pb-2.5 pl-10 pr-3.5 text-[13.5px] text-slate-600">{kind.about}</p>
          {kind.misses.length ? (
            <>
              <span className="block pb-1 pl-10 pr-3.5 pt-2 text-[12.5px] font-semibold text-slate-500">Not read last night</span>
              <ul aria-label={`${kind.name}: not read last night`}>
                {kind.misses.map((m, i) => (
                  <li key={i} className="ml-10 border-t border-slate-100">
                    <Link href={page(m.page)} className="flex min-h-11 items-center gap-2.5 py-2.5 pr-3.5 text-slate-900">
                      <span className="min-w-0 flex-1 text-sm font-semibold">{m.name}</span>
                      <span className="whitespace-nowrap text-[12.5px] font-semibold text-amber-800">{m.why}</span>
                      <Chevron open={false} size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            kind.when &&
            !kindBad(kind) && <span className="block pb-2.5 pl-10 pr-3.5 pt-2 text-[13.5px] font-semibold text-green-800">Nothing missed last night</span>
          )}
          {kind.nights.length > 0 && (
            <>
              <span className="block pb-1 pl-10 pr-3.5 pt-3.5 text-[12.5px] font-semibold text-slate-500">Last 14 nights</span>
              <ul aria-label={`${kind.name}: last 14 nights`}>
                {kind.nights.map((n) => (
                  <li key={n.date} className="ml-10 flex justify-between gap-2 border-t border-slate-100 py-[7px] pr-3.5 text-[13.5px]">
                    <span className="text-slate-600">{n.date}</span>
                    <span className={NIGHT_TONE[n.tone]}>{n.result}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** `runs`: undefined while loading, null when it couldn't be loaded. */
export default function NightlyRuns({ runs, base }: { runs: NightlyRunsLoaded | null | undefined; base: string }) {
  const [open, setOpen] = useState(false)
  const kinds = runs?.available ? runs.kinds : null
  const line = kinds && lastNightLine(kinds)
  const status =
    runs === undefined
      ? { tone: 'text-slate-500', text: 'Loading…' }
      : runs === null
        ? { tone: 'text-slate-500', text: 'Couldn’t load the nightly runs' }
        : !line
          ? { tone: 'text-amber-800', text: 'Keeping a record of the nightly runs needs database migration 086' }
          : { tone: line.good ? 'text-green-800' : 'text-amber-800', text: line.text }
  const warn = !!line && !line.good && !open
  return (
    <section aria-label="Last night" className={`rounded-[10px] border ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <button
        type="button"
        aria-expanded={open}
        disabled={!kinds}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-11 w-full items-center gap-2.5 p-3.5 text-left ${kinds ? 'cursor-pointer' : ''}`}
      >
        {open && <Chevron open />}
        {open || line?.good !== false ? (
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex-1 text-[15px] font-bold text-slate-900">Last night</span>
            {!open && <span className={`text-[13.5px] font-semibold ${status.tone}`}>{status.text}</span>}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold text-slate-900">Last night</span>
            <span className={`text-[13.5px] font-semibold ${status.tone}`}>{status.text}</span>
          </span>
        )}
        {!open && kinds && <Chevron open={false} />}
      </button>
      {open && kinds && (
        <ul>
          {kinds.map((k) => (
            <KindRow key={k.id} kind={k} base={base} />
          ))}
        </ul>
      )}
    </section>
  )
}
