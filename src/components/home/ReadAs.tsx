'use client'

import type { ReadingChip } from '@/lib/readingSearch'

// How a question was read (see questionReader.ts), above its answer: "Read
// as" and a chip for each category, filter, item and distance, any of which
// can be removed. While it's being read, "Reading your question…", shown
// only after a moment so a remembered question doesn't flash it. Shared by
// the desktop search dropdown and the phone's results, like AskAnswer.
export default function ReadAs({
  reading,
  chips,
  onRemove,
  className = '',
}: {
  /** Being read right now. */
  reading: boolean
  chips: ReadingChip[]
  onRemove: (chip: ReadingChip) => void
  className?: string
}) {
  if (reading) {
    return (
      <p role="status" data-testid="read-as-reading" className={`text-[13px] font-semibold text-slate-500 ${className}`} style={{ animation: 'backdropIn 150ms ease-out 300ms both' }}>
        Reading your question…
      </p>
    )
  }
  if (chips.length === 0) return null
  return (
    <div data-testid="read-as" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-[12px] font-semibold text-slate-500">Read as</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip)}
          aria-label={`Remove ${chip.label}`}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-0.5 pl-2.5 pr-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          {chip.label}
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      ))}
    </div>
  )
}
