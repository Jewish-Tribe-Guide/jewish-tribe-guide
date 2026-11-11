'use client'

// ── "16 synagogues | By time": the list's two ways to read a page of shuls ───
// The Synagogues page's way in to every minyan by time (Nov 11, the user's
// pick from the desk canvas, D1/D2). It replaced the green "Minyanim · 5
// left today" card, which made the minyanim feel like a different thing on
// the page; this sits where the list's count was, low-key on purpose. The
// user chose it plain, with no count on "By time", knowing a quiet switch
// was dropped once (Oct 6) as too easy to miss: the review with real people
// is meant to say whether it is.
//
// The view it turns on keeps its own address (`?davening=1`), so Back,
// Forward and a reload land where the visitor was.

type Props = {
  /** How many places the list holds, filters applied. */
  count: number
  /** The category's own words for them, an admin's, never "shuls". */
  singular: string
  plural: string
  byTime: boolean
  onChange: (byTime: boolean) => void
}

export default function MinyanSwitch({ count, singular, plural, byTime, onChange }: Props) {
  const part = (on: boolean) =>
    `h-8 cursor-pointer whitespace-nowrap px-3.5 text-[13.5px] font-semibold transition-colors ${on ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-slate-50'}`
  return (
    <div role="group" aria-label="Show" data-testid="minyan-switch" className="inline-flex shrink-0 overflow-hidden rounded-full border border-slate-300">
      <button type="button" aria-pressed={!byTime} onClick={() => byTime && onChange(false)} className={part(!byTime)}>
        {count} {(count === 1 ? singular : plural).toLowerCase()}
      </button>
      <button type="button" aria-pressed={byTime} onClick={() => !byTime && onChange(true)} className={part(byTime)}>
        By time
      </button>
    </div>
  )
}
