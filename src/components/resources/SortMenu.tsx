'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

// ── Sort, in the list's heading: "Sort Popularity ▾" ────────────────────────
// A small menu of the site's own, the two choices with a check by the one in
// use, drawn like the header's More menu. It used to be the browser's own
// select laid invisibly over the words, which opened the operating system's
// menu on a desktop (grey, square, nothing like the rest of the page) and
// left a focus ring around "Popularity" after a click.
//
// A menu of radio items for anyone using a keyboard or a screen reader:
// arrows move between the choices, Enter picks one, Escape closes and puts
// focus back on Sort. Choosing Distance with nowhere to measure from asks
// for a location instead (selectSort in GenericDirectory), and Sort stays
// on Popularity until one is set.

const CHOICES = [
  { byPopular: true, label: 'Popularity' },
  { byPopular: false, label: 'Distance' },
] as const

export default function SortMenu({ byPopular, onSelect }: { byPopular: boolean; onSelect: (byPopular: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const current = CHOICES.findIndex((c) => c.byPopular === byPopular)

  // Opened, focus goes to the choice in use; a tap or focus anywhere else
  // closes it.
  useEffect(() => {
    if (!open) return
    itemRefs.current[current]?.focus()
    const away = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('focusin', away)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('focusin', away)
    }
  }, [open, current])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = itemRefs.current.findIndex((el) => el === document.activeElement)
    const move = (to: number) => {
      e.preventDefault()
      itemRefs.current[(to + CHOICES.length) % CHOICES.length]?.focus()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(CHOICES.length - 1)
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="flex cursor-pointer items-center gap-1 rounded py-1.5 text-[13.5px] text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {/* The space is for the name it's read out by, "Sort Popularity";
            a flex row doesn't draw it. */}
        Sort{' '}
        <span className="flex items-center gap-0.5 font-bold text-primary">
          <span data-testid="sort-shown">{CHOICES[current].label}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sort"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl"
        >
          {CHOICES.map((c, i) => (
            <button
              key={c.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role="menuitemradio"
              aria-checked={i === current}
              tabIndex={i === current ? 0 : -1}
              onClick={() => {
                close()
                if (i !== current) onSelect(c.byPopular)
              }}
              className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${
                i === current ? 'font-semibold text-primary' : 'font-medium text-slate-800'
              }`}
            >
              {c.label}
              {i === current && (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M5 12.5 10 17 19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
