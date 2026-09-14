'use client'

import { useState } from 'react'
import { PencilIcon } from '@/components/icons'
import ContributePicker from './ContributePicker'

// ── "Suggest a Listing" — desktop mockup match (Phase 6, docs/desktop-
// mockup-plan.md). New card, always the third in the community row beside
// Davening Times/Update Listings (see Landing.tsx's own community-row doc)
// — the Add action UpdateListingsCard used to carry directly, now with a
// card of its own instead of sharing one with "kept by the community"'s
// statement copy. Fixed, non-admin-editable copy (the user's own call for
// this rework — every other card in this row still takes its eyebrow/
// heading from settings).
//
// "Submit a Listing" opens the same ContributePicker (category search →
// that category's Add form) UpdateListingsCard's own Add button used to —
// same state pattern (a `null | 'open'`-shaped boolean, not a full
// ContributeAction union, since this card only ever offers the one action).
//
// The right ~42% is a warm brick-toned photo placeholder, masked to fade
// into the card the same way the Sukkah banner's own placeholder does (see
// CampaignBannerCard) — the text column is capped at `max-w-[58%]` so real
// copy at any length never runs under it.
export default function SuggestListingCard() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[42%] bg-gradient-to-bl from-orange-200 via-orange-300 to-amber-700/60 [mask-image:linear-gradient(to_left,black_60%,transparent)]"
      />
      <div className="relative max-w-[58%]">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Get involved</p>
        <h3 className="font-serif text-lg font-semibold text-ink">Suggest a Listing</h3>
        <p className="mt-2 text-sm text-slate-600">Help keep our community guide accurate and useful.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-slate-50"
        >
          <PencilIcon className="h-4 w-4 shrink-0" />
          Submit a Listing
        </button>
      </div>

      {open && <ContributePicker onClose={() => setOpen(false)} />}
    </div>
  )
}
