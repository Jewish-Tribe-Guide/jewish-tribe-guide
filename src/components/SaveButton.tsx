'use client'

import { BookmarkIcon } from '@/components/icons'

// The bookmark: Save for a place (at the top of its listing, beside the
// thumbs-up) and for a search (in its box, beside ✕). Filled means saved;
// tapping again takes it off, with Undo (UndoToast). Canvas page "you",
// board YouSave.
export default function SaveButton({
  saved,
  onToggle,
  name,
  plain = false,
  round = false,
  className = '',
}: {
  saved: boolean
  onToggle: () => void
  /** What it saves, for a screen reader: "Save Trader Joe’s". */
  name: string
  /** No ring when unsaved: inside a search box, where a ring would read as
   *  a second box. */
  plain?: boolean
  /** A bigger, tinted circle (44px), unsaved too (board 2b, Nov 16): You's
   *  own search, where saving is the whole point of the line. */
  round?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Inside a tappable row or header: saving shouldn't also open it.
        e.stopPropagation()
        onToggle()
      }}
      aria-pressed={saved}
      aria-label={`Save ${name}`}
      title={saved ? 'Saved' : 'Save'}
      data-testid="save-button"
      className={[
        `inline-flex ${round ? 'h-11 w-11' : 'h-9 w-9'} shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors`,
        saved
          ? 'bg-primary text-white hover:bg-primary-dark'
          : round
            ? 'bg-primary/10 text-primary hover:bg-primary/20'
            : plain
            ? 'text-primary hover:bg-primary/10'
            : 'border border-slate-300 bg-white text-primary hover:border-slate-400',
        className,
      ].join(' ')}
    >
      <BookmarkIcon filled={saved} className={round ? 'h-5 w-5' : 'h-[17px] w-[17px]'} />
    </button>
  )
}
