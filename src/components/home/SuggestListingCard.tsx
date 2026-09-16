'use client'

import { useState } from 'react'
import Image from 'next/image'
import ContributePicker from './ContributePicker'
import { isOptimizableImage } from '@/lib/imageHosts'

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
// The right ~42% is a real photo (a blue-fronted local shopfront —
// Unsplash, same sourcing/licensing as the category tile photos elsewhere),
// masked to fade into the card the same way the Sukkah banner's own photo
// does (see CampaignBannerCard) — the text column is capped at
// `max-w-[58%]` so real copy at any length never runs under it. Replaces
// the plain orange/amber gradient placeholder every other card without a
// real photo yet still falls back to.
//
// unoptimized={!isOptimizableImage(...)}: this went out with no gate at all
// for a while, unlike every other hardcoded photo on this screen
// (CampaignBannerCard, DaveningTimesCard, HeroHeading) — worked fine until
// the deployed site's Image Optimization quota was actually exhausted, at
// which point Vercel returned a 402 for this one request and the card just
// showed nothing. NEXT_PUBLIC_IMAGES_UNOPTIMIZED (see imageHosts.ts) is set
// for exactly this, but only for images that actually check it.
const PHOTO_URL =
  'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8c3RvcmV8ZW58MHx8MHx8fDA%3D'

export default function SuggestListingCard() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[42%] overflow-hidden [mask-image:linear-gradient(to_left,black_60%,transparent)]"
      >
        <Image
          src={PHOTO_URL}
          alt=""
          fill
          sizes="(min-width: 640px) 42vw, 0px"
          className="object-cover"
          unoptimized={!isOptimizableImage(PHOTO_URL)}
        />
      </div>
      <div className="relative max-w-[58%]">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Get involved</p>
        <h3 className="font-serif text-lg font-semibold text-ink">Suggest a Listing</h3>
        <p className="mt-2 text-sm text-slate-600">Help keep our community guide accurate and useful.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-slate-50"
        >
          Submit a Listing
        </button>
      </div>

      {open && <ContributePicker onClose={() => setOpen(false)} />}
    </div>
  )
}
