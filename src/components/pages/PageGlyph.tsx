import type { PointGlyph } from '@/lib/pageSections'

// Line icons for About's and Privacy's named points (pageSections.ts's
// pointGlyph picks one from the point's words). Stroke-only, 24-unit, like
// the category glyphs; never emoji.
const PATHS: Record<PointGlyph | 'plus' | 'map' | 'chevron' | 'chevronDown' | 'send' | 'mail' | 'tick', string> = {
  home: 'M3 11 12 4l9 7M5 10v10h14V10',
  bag: 'M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  hospital: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8v8M8 12h8',
  people: 'M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6',
  star: 'M12 3 20 17H4zM12 21 4 7h16z',
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0M3 3l18 18',
  bookmark: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM4 4l16 16',
  read: 'M4 6h16M4 12h10M4 18h7M18 13a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM20.2 18.2l1.8 1.8',
  check: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM8 12l3 3 5-6',
  plus: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 8v8M8 12h8',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  chevron: 'm9 6 6 6-6 6',
  send: 'M4 12 20 4l-6 16-3-7zM11 13l9-9',
  mail: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 7l8 6 8-6',
  tick: 'm5 12 5 5 9-10',
  chevronDown: 'm6 9 6 6 6-6',
}

export type PageGlyphName = keyof typeof PATHS

export function PageGlyph({ name, className = 'h-5 w-5' }: { name: PageGlyphName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** The pale-blue circle an icon sits in. */
export function GlyphDot({ name, large = false }: { name: PageGlyphName; large?: boolean }) {
  return (
    <span className={`flex flex-none items-center justify-center rounded-full bg-blue-50 text-blue-600 ${large ? 'h-10 w-10' : 'h-9 w-9'}`}>
      <PageGlyph name={name} className={large ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
    </span>
  )
}
