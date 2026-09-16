'use client'

import { useEffect } from 'react'
import type { DirectoryResource } from '@/types'
import ReportListing from './ReportListing'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

type Props = {
  isOpen: boolean
  onClose: () => void
  listing: DirectoryResource
  upLabel: string
}

/** Mobile's Report action, as a bottom sheet over the still-visible (dimmed)
 *  card list, instead of navigating to a full screen — see GenericListingCard's
 *  own kebab doc for why this moved here. Report's own form is short (an
 *  issue description, an optional name), so unlike Edit — long, category-
 *  aware, and left as a full screen — it comfortably fits without needing
 *  to grow to near-full-height itself.
 *
 *  Deliberately not MobileNearbySheet's drag-to-resize machinery: that
 *  sheet has real content worth resizing around (a map underneath it).
 *  This one holds a single short form at a fixed height, so open/dismiss —
 *  backdrop tap, Escape, or the close button — is the whole interaction.
 *  Same conventions as ListingDetailModal otherwise: body scroll locks
 *  while open, Escape closes it. */
export default function ReportSheet({ isOpen, onClose, listing, upLabel }: Props) {
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-900/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl animate-[sheetUp_220ms_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label="Report a problem"
      >
        {/* A drag handle would promise a drag gesture this sheet doesn't
            have (see this component's own doc) — a plain header with a
            real close button instead, same affordance ListingDetailModal
            gives desktop. */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Report a problem</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex cursor-pointer items-center justify-center rounded-full p-2 text-muted hover:text-slate-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <ReportListing listing={listing} upLabel={upLabel} onUp={onClose} onSubmitted={onClose} embedded />
        </div>
      </div>
    </div>
  )
}
