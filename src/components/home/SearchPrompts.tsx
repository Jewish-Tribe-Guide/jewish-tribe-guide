'use client'

import { useLayoutEffect, useRef, useState } from 'react'

// A few questions to tap under the search box (see searchPrompts.ts): the
// first try at search, made one that works. Each fills the box and shows its
// answer, the same as typing it.
//
// Always one line, the most fitting question first.
// - A phone: up to six, in a row that swipes sideways (the user, Oct 17:
//   "more, on one line, swipe left to right"). It runs to the screen's edge,
//   so the last one shows cut off: that's what says there are more. On
//   Oct 15 a phone had been held to the two that fit, after a sideways row
//   that ended inside the page's margin and read as complete.
// - A computer: three, the next ones that fit beside the first, measured
//   where it's shown (Oct 16: the third used to wrap under the other two).
export default function SearchPrompts({
  prompts,
  onPick,
  className = '',
  oneLine = false,
}: {
  prompts: string[]
  onPick: (prompt: string) => void
  className?: string
  /** A phone: up to six, swiped sideways. Otherwise up to three that fit. */
  oneLine?: boolean
}) {
  if (prompts.length === 0) return null
  if (oneLine) return <SwipedPrompts prompts={prompts.slice(0, PHONE_MOST)} onPick={onPick} className={className} />
  return <FittedPrompts prompts={prompts} onPick={onPick} className={className} />
}

/** How many a phone's row holds. */
export const PHONE_MOST = 6

const chip =
  'cursor-pointer whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13.5px] font-medium text-ink shadow-sm transition-colors hover:border-primary/50 hover:text-primary-dark'

function Label() {
  return (
    <span data-prompt-label className="text-[13px] font-medium text-slate-500">
      Try asking
    </span>
  )
}

function SwipedPrompts({ prompts, onPick, className }: { prompts: string[]; onPick: (prompt: string) => void; className: string }) {
  // -mx-4/px-4: out to the screen's edges, past the page's 16px gutter, and
  // back in for the first chip, so it starts in line with the box.
  return (
    <div
      className={`-mx-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 ${className}`}
      data-testid="search-prompts"
      data-swipe
    >
      <Label />
      {prompts.map((p) => (
        <button key={p} type="button" data-prompt onClick={() => onPick(p)} className={chip}>
          {p}
        </button>
      ))}
    </div>
  )
}

function FittedPrompts({ prompts, onPick, className }: { prompts: string[]; onPick: (prompt: string) => void; className: string }) {
  const row = useRef<HTMLDivElement>(null)
  // Which prompts show on one line; all of them until measured.
  const [fitting, setFitting] = useState<number[] | null>(null)
  // All of them, so a shorter one further down can take the place of one
  // that doesn't fit.
  const offered = prompts
  const most = 3
  const key = offered.join('\n')

  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const measure = () => {
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0
      const label = el.querySelector<HTMLElement>('[data-prompt-label]')
      const chips = [...el.querySelectorAll<HTMLElement>('[data-prompt]')]
      let used = (label?.offsetWidth ?? 0) + gap
      const shown: number[] = []
      chips.forEach((c, i) => {
        if (shown.length === most) return
        const width = c.offsetWidth
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
  }, [most, key])

  return (
    <div
      ref={row}
      className={`relative flex items-center gap-2 overflow-hidden whitespace-nowrap [&>*]:shrink-0 ${className}`}
      data-testid="search-prompts"
    >
      <Label />
      {offered.map((p, i) => {
        // Measured where it would sit, but out of the line, unseen and out
        // of reach of a tab or a screen reader, when it doesn't fit.
        // Before it's measured, the first `most`.
        const left = fitting !== null ? !fitting.includes(i) : i >= most
        return (
          <button
            key={p}
            type="button"
            data-prompt
            onClick={() => onPick(p)}
            aria-hidden={left || undefined}
            tabIndex={left ? -1 : undefined}
            className={`${chip} ${left ? 'invisible absolute' : ''}`}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
