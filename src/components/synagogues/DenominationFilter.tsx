'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string[]
  options: string[]
  onChange: (v: string[]) => void
  /** Label for the "no filter" choice (e.g. "All Denominations"). */
  allLabel?: string
}

// A custom multi-select dropdown styled like the toggle buttons beside it.
// Native <select> can't be used here: a global rule forces selects to 16px on
// mobile (to stop iOS zoom-on-focus), which makes the text bigger than the
// adjacent toggle and overflows tight rows. A button-based control isn't subject
// to that rule, so it can match the 14px toggle and show its full label.
export default function DenominationFilter({ value, options, onChange, allLabel = 'All Denominations' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const label =
    value.length === 0 ? allLabel : value.length === 1 ? value[0] : `${value.length} denominations`

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer max-w-[10.5rem] sm:max-w-none"
      >
        <span className="truncate">{label}</span>
        <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg py-1">
          {/* "All" clears every selection and closes the dropdown — the rest
              stay open on click so several can be picked in one go. */}
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false) }}
            className={[
              'block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-slate-50 cursor-pointer',
              value.length === 0 ? 'font-medium text-primary' : 'text-slate-700',
            ].join(' ')}
          >
            {allLabel}
          </button>
          <div className="my-1 border-t border-slate-100" />
          {options.map((opt) => {
            const checked = value.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={[
                  'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-slate-50 cursor-pointer',
                  checked ? 'font-medium text-primary' : 'text-slate-700',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                    checked ? 'border-primary bg-primary' : 'border-slate-300 bg-white',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {checked && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
