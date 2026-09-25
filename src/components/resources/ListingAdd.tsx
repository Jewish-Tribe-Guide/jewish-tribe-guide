'use client'

import { useState } from 'react'
import { isCategorySyncEligible, type CategoryConfig } from '@/lib/categories'
import type { DirectoryResource } from '@/types'
import AddressInput from '@/components/intake/AddressInput'
import UpButton from '@/components/UpButton'
import ActionDialog from './ActionDialog'
import ListingEditor from './ListingEditor'
import MobileSheet from './MobileSheet'
import { useListingDraft } from './useListingDraft'

type Props = {
  category: CategoryConfig
  /** The category's listings, to spot one that's already in the guide. */
  listings: DirectoryResource[]
  isMobile: boolean
  isOpen: boolean
  onClose: () => void
  sharedTurnstile?: { token: string; reset: () => void }
}

/**
 * Adding a listing, in two steps. First find the place on Google — the
 * search the form always started with, given the whole screen, since it
 * fills in most of the listing (name, phone, hours, website, description).
 * Then finish it in the listing's own shape: the same editor Suggest an
 * edit uses (ListingEditor), started from what Google gave, so only what
 * Google can't know is left — kosher type, certification, a photo.
 *
 * "Not on Google? Enter it yourself" skips to the second step empty, and a
 * category with no address (a WhatsApp group, say) has nothing to look up,
 * so it opens there directly. One design either way; there's no second
 * form for the rare case.
 *
 * A place the guide already has is marked in the search results, and the
 * editor says so again if what's being added matches a listing — by Google
 * place, by link, or by name.
 *
 * The same sheet as Edit on a phone, and the same dialog shape on desktop:
 * the title centred beside Back, and Send floating under the dialog.
 */
export default function ListingAdd({ category, listings, isMobile, isOpen, onClose, sharedTurnstile }: Props) {
  const googleFirst = isCategorySyncEligible(category)
  const firstStep = googleFirst ? 'find' : 'finish'
  const [step, setStep] = useState<'find' | 'finish'>(firstStep)
  const [sendSlot, setSendSlot] = useState<HTMLElement | null>(null)

  // Back to the search each time it opens — adjusted during render, as
  // ListingDetailModal resets its own steps, so a reopened Add never shows
  // one frame of the last one's second step.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setStep(firstStep)
  }

  const title = `Add a ${category.label}`
  const onBack = googleFirst && step === 'finish' ? () => setStep('find') : undefined
  // Mounted only while open, so the draft starts fresh every time.
  const flow = isOpen && (
    <AddFlow
      category={category}
      listings={listings}
      step={step}
      onFound={() => setStep('finish')}
      sendSlot={isMobile ? null : sendSlot}
      sharedTurnstile={sharedTurnstile}
      onClose={onClose}
    />
  )

  if (isMobile) {
    return (
      <MobileSheet isOpen={isOpen} onClose={onClose} title={title} draggable titleHidden>
        {/* Back and the title in one row, as Suggest an edit has it
            (MapPlaceDetail); the empty third column keeps the title
            centred. */}
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {onBack ? <UpButton label="Back" onClick={onBack} className="" /> : <span />}
          <h2 className="truncate text-center text-base font-semibold text-slate-900">{title}</h2>
        </div>
        {flow}
      </MobileSheet>
    )
  }
  return (
    <ActionDialog isOpen={isOpen} onClose={onClose} title={title} listingShaped={{ onBack, setSendSlot }}>
      {flow}
    </ActionDialog>
  )
}

function AddFlow({
  category,
  listings,
  step,
  onFound,
  sendSlot,
  sharedTurnstile,
  onClose,
}: {
  category: CategoryConfig
  listings: DirectoryResource[]
  step: 'find' | 'finish'
  onFound: () => void
  sendSlot: HTMLElement | null
  sharedTurnstile?: { token: string; reset: () => void }
  onClose: () => void
}) {
  // Lives here, above both steps, so the search fills it in and going Back
  // to search again keeps what was already typed on the second step.
  const draft = useListingDraft(category)
  const [fromGoogle, setFromGoogle] = useState(false)
  const inGuide = new Set(listings.map((l) => l.placeId).filter((id): id is string => typeof id === 'string' && !!id))

  if (step === 'find') {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-600">Reviewed by a moderator before it goes live</p>
        <div>
          <label htmlFor="add-find-place" className="mb-1 block text-sm font-semibold text-slate-700">
            Find the place
          </label>
          <AddressInput
            id="add-find-place"
            autoFocus
            value={draft.address}
            onChange={draft.setAddress}
            onCoords={draft.setCoords}
            onPlaceSelect={(result) => {
              draft.handlePlaceSelect(result)
              setFromGoogle(true)
              onFound()
            }}
            placeholder="Search by business name or address…"
            suggestionNote={(placeId) => (inGuide.has(placeId) ? 'Already in the guide' : null)}
            inlineSuggestions
          />
        </div>
        <p className="text-center">
          <button
            type="button"
            onClick={() => {
              setFromGoogle(false)
              onFound()
            }}
            className="cursor-pointer text-sm text-primary hover:underline"
          >
            Not on Google? Enter it yourself
          </button>
        </p>
      </div>
    )
  }

  return (
    <ListingEditor
      category={category}
      draft={draft}
      fromGoogle={fromGoogle}
      existingListings={listings}
      onClose={onClose}
      sendSlot={sendSlot}
      sharedTurnstile={sharedTurnstile}
    />
  )
}
