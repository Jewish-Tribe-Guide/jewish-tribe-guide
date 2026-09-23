import { useRef, useState, type MouseEvent, type ReactNode } from 'react'

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
  amber: 'bg-caution/10 text-caution border-caution/30',
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
  amber: 'hover:bg-caution/20 active:bg-caution/30',
  green: 'hover:bg-green-100 active:bg-green-200',
  greenSolid: 'hover:bg-green-700 active:bg-green-800',
  red: 'hover:bg-red-100 active:bg-red-200',
}

// The "yes, that registered" confirmation for badges that filter the page —
// held with real state, not CSS `:active` (which reverts the instant the
// finger lifts, before there's been any chance to notice the list actually
// changed). One fixed color regardless of the chip's own tone, matching
// `bg-primary`/`border-primary`, the same blue GenericDirectory's own filter
// row already uses for "this filter is on" (the Filters button, boolean
// chips, the sort toggle) — so a badge click reads as the same event as
// clicking the equivalent control up in the filter row, rather than each
// tone flashing its own unrelated darker shade.
const PRESSED_CLASS = 'bg-primary text-white border-primary'
const PRESSED_HOLD_MS = 400

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
  const [pressed, setPressed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cls = [
    BASE,
    pressed ? PRESSED_CLASS : TONE_BASE[tone],
    SIZE[size],
    onClick ? `transition-colors cursor-pointer ${pressed ? '' : TONE_HOVER[tone]}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (onClick) {
    const handleClick = (e: MouseEvent) => {
      onClick(e)
      setPressed(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setPressed(false), PRESSED_HOLD_MS)
    }
    return (
      <button onClick={handleClick} title={title} className={cls}>
        {children}
      </button>
    )
  }
  return <span className={cls}>{children}</span>
}
