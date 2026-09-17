'use client'

import type { DirectoryResource } from '@/types'
import ReportListing from './ReportListing'
import MobileSheet from './MobileSheet'

type Props = {
  isOpen: boolean
  onClose: () => void
  listing: DirectoryResource
  upLabel: string
}

/** Mobile's Report action, as a bottom sheet over the still-visible (dimmed)
 *  card list, instead of navigating to a full screen — see GenericListingCard's
 *  own kebab doc for why this moved here. Report's own form is short (an
 *  issue description, an optional name), so it rarely needs the extra room
 *  `full` gives — draggable anyway, for the same reason the FindResources
 *  fallback below is: not because this form needs it, but so every Report
 *  surface handles the same way as Edit instead of only some of them
 *  resizing/sliding smoothly and others not. */
export default function ReportSheet({ isOpen, onClose, listing, upLabel }: Props) {
  return (
    <MobileSheet isOpen={isOpen} onClose={onClose} title="Report a problem" draggable>
      <ReportListing listing={listing} upLabel={upLabel} onUp={onClose} onSubmitted={onClose} embedded />
    </MobileSheet>
  )
}
