'use client'

// ── "Synagogue | Minyan": the list's two ways to read a page of shuls ───
// The Synagogues page's way in to every minyan by time (Nov 11, the user's
// pick from the desk canvas, D1/D2). It replaced the green "Minyanim · 5
// left today" card, which made the minyanim feel like a different thing on
// the page; this sits where the list's count was, low-key on purpose. The
// user chose it plain, with no count on "By time", knowing a quiet switch
// was dropped once (Oct 6) as too easy to miss: the review with real people
// is meant to say whether it is.
//
// No number on either half (the user, Nov 11: "By synagogue instead of the
// number"): two ways to see the same places, worded alike, so it reads as a
// choice rather than a count.
//
// Nov 11, later: "Synagogue | Minyan", no "By" (the user: "take out 'by'
// and replace time with minyan").
//
// As tall as Filters and Sort beside it, 40px with its border (the user,
// Nov 11: "Yes, match it"); it was 34px and looked like the odd one out.
//
// The view it turns on keeps its own address (`?davening=1`), so Back,
// Forward and a reload land where the visitor was.

type Props = {
  /** The category's own word for one place, an admin's, never "shul". */
  singular: string
  byTime: boolean
  onChange: (byTime: boolean) => void
}

export default function MinyanSwitch({ singular, byTime, onChange }: Props) {
  const part = (on: boolean) =>
    `h-[38px] cursor-pointer whitespace-nowrap px-3.5 text-[14px] font-semibold transition-colors ${on ? 'bg-primary text-white' : 'bg-white text-ink hover:bg-slate-50'}`
  return (
    <div role="group" aria-label="Show" data-testid="minyan-switch" className="inline-flex shrink-0 overflow-hidden rounded-full border border-slate-300">
      <button type="button" aria-pressed={!byTime} onClick={() => byTime && onChange(false)} className={part(!byTime)}>
        {singular}
      </button>
      <button type="button" aria-pressed={byTime} onClick={() => !byTime && onChange(true)} className={part(byTime)}>
        Minyan
      </button>
    </div>
  )
}
