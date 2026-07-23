'use client'

import { useState } from 'react'

type Props = {
  title: string
  children: React.ReactNode
  /** Render expanded on first paint (the visitor can still collapse it).
   *  Ignored in controlled mode (see `open`). */
  defaultOpen?: boolean
  /** Controlled mode: the parent owns open/closed state (e.g. syncing a home
   *  page category row with the map's isolated category) instead of this
   *  component tracking it internally. Provide both `open` and `onToggle`
   *  together, or neither. */
  open?: boolean
  onToggle?: () => void
  /** When set, the whole header is filled with this color (e.g. matching the
   *  category's map pin color) instead of the default white/muted look —
   *  text switches to white for contrast. */
  accentColor?: string
  /** A count shown after the title (e.g. how many listings this category
   *  has), same idea as the map's own filter-chip counts. */
  count?: number
}

export default function Collapsible({ title, children, defaultOpen = false, open, onToggle, accentColor, count }: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = open !== undefined
  const isExpanded = isControlled ? open : internalOpen
  const toggle = () => (isControlled ? onToggle?.() : setInternalOpen((prev) => !prev))

  return (
    <div className="border-2 border-slate-300 rounded-lg bg-white overflow-hidden">
      <button
        onClick={toggle}
        aria-expanded={isExpanded}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer ${
          accentColor ? 'hover:brightness-110' : 'hover:bg-slate-50'
        }`}
      >
        <span
          className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${accentColor ? 'text-white' : 'text-muted'}`}
        >
          {title}
          {count != null && (
            <span className={accentColor ? 'text-white/80' : 'text-slate-400'}>{count}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-4 ${accentColor ? 'text-white' : 'text-muted'} ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t-2 border-slate-200 px-4 py-3 bg-slate-50">
          {children}
        </div>
      )}
    </div>
  )
}
