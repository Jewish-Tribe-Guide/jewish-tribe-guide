'use client'

import { useState } from 'react'

// WCAG relative luminance of a `#rrggbb` hex color — used below to pick white
// vs. dark header text against a solid `accentColor` fill. The category-color
// ramp spans a dark navy down to a fairly light blue, so a hardcoded "always
// white" text color would wash out on the lightest couple of steps.
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// True once white text on `accentColor` would drop below a safe contrast
// ratio (~3:1, the WCAG floor for large/bold text like this header) — at
// that point dark text reads better than white. Exported so other callers
// cycling the same ACCENT_PALETTE (e.g. Landing.tsx's Get Connected tabs)
// can reuse this instead of hardcoding a check against one specific hex,
// which silently stops working the moment the palette's pale step changes.
export function needsDarkText(hex: string): boolean {
  const contrastWithWhite = 1.05 / (relativeLuminance(hex) + 0.05)
  return contrastWithWhite < 3
}

type Props = {
  title: React.ReactNode
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
  /** When set, this category's map pin color fills the ENTIRE header (not
   *  just the border) — text/count/chevron switch to white or dark (see
   *  `needsDarkText`) for contrast against that fill. */
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
  const darkText = !!accentColor && needsDarkText(accentColor)

  return (
    <div
      style={accentColor ? { borderColor: accentColor } : undefined}
      className={`rounded-lg overflow-hidden ${accentColor ? 'border-2' : 'border border-slate-300 bg-[#fefefe]'}`}
    >
      <button
        onClick={toggle}
        aria-expanded={isExpanded}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
          accentColor ? 'hover:brightness-110' : 'hover:bg-slate-50'
        }`}
      >
        <span
          className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${
            accentColor ? (darkText ? 'text-slate-900' : 'text-white') : 'text-muted'
          }`}
        >
          {title}
          {count != null && (
            <span className={accentColor ? '' : 'text-slate-400'}>{count}</span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ml-4 ${
            accentColor ? (darkText ? 'text-slate-900' : 'text-white') : 'text-muted'
          } ${isExpanded ? 'rotate-180' : ''}`}
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
        <div className="border-t-2 border-slate-200 px-3 py-2 bg-slate-50">
          {children}
        </div>
      )}
    </div>
  )
}
