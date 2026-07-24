'use client'

import { useState } from 'react'

// WCAG relative luminance of a `#rrggbb` hex color, used below to pick
// white vs. dark header text against `accentColor` — that color's own ramp
// now spans dark navy to a genuinely pale blue (see CATEGORY_COLORS in
// ResourceMapView.tsx), so a hardcoded "always white" text color would wash
// out on the lighter end.
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// True once white text on `accentColor` would drop below a safe contrast
// ratio (~3:1, the WCAG floor for large/bold text like this header) — at
// that point dark text reads better than white.
function needsDarkText(hex: string): boolean {
  const contrastWithWhite = 1.05 / (relativeLuminance(hex) + 0.05)
  return contrastWithWhite < 3
}

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
   *  text switches to white (or dark, see `needsDarkText`) for contrast.
   *  The border is always `#000000` regardless of this color (matches the
   *  1px black border convention used everywhere else on this page — see
   *  [[project_art_deco_home_redesign]]), not the fill color anymore. */
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
      className={`border rounded-lg bg-white overflow-hidden ${accentColor ? '' : 'border-slate-300'}`}
    >
      <button
        onClick={toggle}
        aria-expanded={isExpanded}
        style={accentColor ? { backgroundColor: `${accentColor}BF` } : undefined}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer ${
          accentColor ? 'hover:brightness-110' : 'hover:bg-slate-50'
        }`}
      >
        <span
          className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${
            accentColor ? (darkText ? 'text-slate-900' : 'text-white') : 'text-muted'
          }`}
        >
          {title}
          {count != null && (
            <span className={accentColor ? (darkText ? 'text-slate-900/70' : 'text-white/80') : 'text-slate-400'}>{count}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-4 ${
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
        <div className="border-t-2 border-slate-200 px-4 py-3 bg-slate-50">
          {children}
        </div>
      )}
    </div>
  )
}
