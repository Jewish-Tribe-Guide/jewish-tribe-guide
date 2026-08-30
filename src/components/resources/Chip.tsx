import type { MouseEvent, ReactNode } from 'react'

// The small rounded pill used across a listing card: clickable filter/tag chips
// and static detail badges. Consolidates the tone + size + interactive classes
// that were previously hand-written at every call site (and easy to get subtly
// wrong). A chip is interactive iff it has an onClick — that's when it renders
// as a <button> and gets the hover/active/cursor treatment; otherwise it's a
// plain <span>.

export type ChipTone = 'slate' | 'slateMuted' | 'amber' | 'green' | 'greenSolid' | 'red'
export type ChipSize = 'header' | 'expanded'

// Always-on background/text/border for each tone.
const TONE_BASE: Record<ChipTone, string> = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  slateMuted: 'bg-slate-100 text-slate-500 border-slate-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  greenSolid: 'bg-green-600 text-white border-green-600',
  // Matches the "Permanently closed" badge PlaceDetailBody already renders, so
  // the collapsed card and the expanded body say the same thing the same way.
  red: 'bg-red-50 text-red-700 border-red-200',
}

// Hover/active shades, applied only when the chip is interactive.
const TONE_HOVER: Record<ChipTone, string> = {
  slate: 'hover:bg-slate-200 active:bg-slate-300',
  slateMuted: 'hover:bg-slate-200 active:bg-slate-300',
  amber: 'hover:bg-amber-100 active:bg-amber-200',
  green: 'hover:bg-green-100 active:bg-green-200',
  greenSolid: 'hover:bg-green-700 active:bg-green-800',
  red: 'hover:bg-red-100 active:bg-red-200',
}

// Header chips get a taller tap target on mobile; expanded-panel chips are compact.
const SIZE: Record<ChipSize, string> = {
  header: 'px-2 py-1 sm:py-0.5',
  expanded: 'px-2 py-0.5',
}

const BASE = 'text-xs font-medium border rounded-full'

type Props = {
  tone: ChipTone
  size?: ChipSize
  title?: string
  /** Extra classes (rarely needed). */
  className?: string
  /** Present → renders a clickable <button> with hover/active states. */
  onClick?: (e: MouseEvent) => void
  children: ReactNode
}

export default function Chip({ tone, size = 'header', title, className, onClick, children }: Props) {
  const cls = [
    BASE,
    TONE_BASE[tone],
    SIZE[size],
    onClick ? `transition-colors cursor-pointer ${TONE_HOVER[tone]}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (onClick) {
    return (
      <button onClick={onClick} title={title} className={cls}>
        {children}
      </button>
    )
  }
  return <span className={cls}>{children}</span>
}
