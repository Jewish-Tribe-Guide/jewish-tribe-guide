'use client'

import { useState } from 'react'
import ContributePicker from './ContributePicker'

// ── Suggest a Listing, on its own after the map (board G5b, Nov 11) ─────────
// The turn from using the guide to adding to it, so it stands alone rather
// than sharing a row with the times: a heading, one line and one button,
// with no photo (the user: "maybe the davening times and candles and stuff
// don't need pictures"). The button opens the same picker as the "+ Add"
// button, so a visitor chooses what to add before any form.
export default function SuggestListingCard() {
  const [open, setOpen] = useState(false)

  return (
    <div data-testid="home-suggest" className="flex items-center gap-7 rounded-2xl bg-white px-9 py-[30px] ring-1 ring-slate-900/5">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Kept up by the community</p>
        <h3 className="mt-1.5 text-[28px] font-extrabold text-ink">Know a place we’re missing?</h3>
        <p className="mt-1 text-[15px] text-slate-600">Add it, or fix one that’s out of date. A person checks every change.</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[50px] shrink-0 cursor-pointer items-center rounded-full bg-primary px-[26px] text-base font-bold text-white transition-colors hover:bg-primary-dark"
      >
        Suggest a listing
      </button>

      {open && <ContributePicker onClose={() => setOpen(false)} />}
    </div>
  )
}
