'use client'

import { useState } from 'react'
import ContributePicker from './ContributePicker'
import { HOME_CARD_OUTLINE, NARROW_STACK } from './AnswerCard'

// ── Suggest a Listing, on its own after the map (board G5b, Nov 11) ─────────
// The turn from using the guide to adding to it, so it stands alone rather
// than sharing a row with the times: a heading, one line and one button,
// with no photo (the user: "maybe the davening times and candles and stuff
// don't need pictures"). The button opens the same picker as the "+ Add"
// button, so a visitor chooses what to add before any form.
export default function SuggestListingCard() {
  const [open, setOpen] = useState(false)

  return (
    // Sized by its own width, not the window's (the user, Nov 12): side by
    // side once the card is 920px wide, stacked below that, so it holds up
    // in a narrow window or beside another card in a row.
    <div className="@container h-full">
    <div data-testid="home-suggest" className={`${NARROW_STACK} h-full gap-6 rounded-[18px] bg-white p-9 @[920px]:min-h-[240px] @[920px]:gap-9 @[920px]:p-14 ${HOME_CARD_OUTLINE}`}>
      <div className="min-w-0 @[920px]:flex-1">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">Kept up by the community</p>
        <h3 className="mt-2.5 text-[30px] font-extrabold leading-[1.1] text-ink @xl:text-[38px]">Know a place we’re missing?</h3>
        <p className="mt-2 text-lg text-slate-600">Add it, or fix one that’s out of date. A person checks every change.</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-14 shrink-0 cursor-pointer items-center rounded-full bg-primary px-[30px] text-[17px] font-bold text-white transition-colors hover:bg-primary-dark"
      >
        Suggest a listing
      </button>

      {open && <ContributePicker onClose={() => setOpen(false)} />}
    </div>
    </div>
  )
}
