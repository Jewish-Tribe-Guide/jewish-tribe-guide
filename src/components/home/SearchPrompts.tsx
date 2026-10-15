'use client'

import { useLayoutEffect, useRef, useState } from 'react'

// A few questions to tap under the search box (see searchPrompts.ts): the
// first try at search, made one that works. Each fills the box and shows its
// answer, the same as typing it.
//
// On a phone, two at most and on one line (the user, Oct 15): the most
// fitting question always, then the next that fits beside it, measured on
// the phone itself, since widths differ from phone to phone. It used to
// show three, scrolling sideways or wrapping to a second row.
export default function SearchPrompts({
  prompts,
  onPick,
  className = '',
  oneLine = false,
}: {
  prompts: string[]
  onPick: (prompt: string) => void
  className?: string
  /** A phone: up to two, on one line. Otherwise up to three, wrapping. */
  oneLine?: boolean
}) {
  const row = useRef<HTMLDivElement>(null)
  // Which prompts show on one line; all of them until measured.
  const [fitting, setFitting] = useState<number[] | null>(null)
  const offered = prompts.slice(0, oneLine ? prompts.length : 3)
  const key = offered.join('\n')

  useLayoutEffect(() => {
    const el = row.current
    if (!oneLine || !el) return
    const measure = () => {
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0
      const label = el.querySelector<HTMLElement>('[data-prompt-label]')
      const chips = [...el.querySelectorAll<HTMLElement>('[data-prompt]')]
      let used = (label?.offsetWidth ?? 0) + gap
      const shown: number[] = []
      chips.forEach((chip, i) => {
        if (shown.length === 2) return
        const width = chip.offsetWidth
        // The first always: it's the question for this moment.
        if (shown.length === 0 || used + width <= el.clientWidth) {
          shown.push(i)
          used += width + gap
        }
      })
      setFitting((prev) => (prev && prev.join() === shown.join() ? prev : shown))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [oneLine, key])

  if (offered.length === 0) return null
  return (
    <div
      ref={row}
      className={`relative flex items-center gap-2 ${oneLine ? 'overflow-hidden whitespace-nowrap [&>*]:shrink-0' : 'flex-wrap'} ${className}`}
      data-testid="search-prompts"
    >
      <span data-prompt-label className="text-[13px] font-medium text-slate-500">
        Try asking
      </span>
      {offered.map((p, i) => {
        // Measured where it would sit, but out of the line, unseen and out
        // of reach of a tab or a screen reader, when it doesn't fit.
        const left = oneLine && fitting !== null && !fitting.includes(i)
        return (
          <button
            key={p}
            type="button"
            data-prompt
            onClick={() => onPick(p)}
            aria-hidden={left || undefined}
            tabIndex={left ? -1 : undefined}
            className={`cursor-pointer whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13.5px] font-medium text-ink shadow-sm transition-colors hover:border-primary/50 hover:text-primary-dark ${left ? 'invisible absolute' : ''}`}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
