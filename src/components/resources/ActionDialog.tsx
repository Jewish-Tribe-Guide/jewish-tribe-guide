'use client'

import { useEffect, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import BackIconButton from '@/components/BackIconButton'

type Props = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** The listing-shaped layout Add shares with the listing dialog
   *  (ListingDetailModal) in edit mode: that dialog's width, the title
   *  centred between Back and Close, and the send button floating under
   *  the dialog rather than inside it. */
  listingShaped?: {
    /** Shows Back, which steps back within the dialog (Add's search). */
    onBack?: () => void
    /** Receives the element under the dialog the send button goes into. */
    setSendSlot: (el: HTMLElement | null) => void
  }
}

/** Desktop's Add/Edit — layered on top of the still-visible (dimmed)
 *  directory grid instead of replacing the whole screen with the form, the
 *  same "stay in place" reasoning as ListingDetailModal (viewing a listing)
 *  and mobile's own MobileSheet. Unlike ListingDetailModal's max-w-md — sized
 *  for a listing's own facts — this holds a real form (ListingForm),
 *  which needs more width for address/hours/tag inputs and
 *  more height before it needs its own internal scroll.
 *
 *  Same conventions as ListingDetailModal otherwise: backdrop click and
 *  Escape both close it, body scroll locks while open. */
export default function ActionDialog({ isOpen, onClose, title, children, listingShaped }: Props) {
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

  const closeButton = (
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
  )

  // Destructured, not read through the object: the React Compiler's lint
  // takes any object passed to `ref` for a ref, and every other read of it
  // for a read during render.
  const { onBack, setSendSlot } = listingShaped ?? {}

  if (listingShaped) {
    return (
      <div
        className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        role="presentation"
      >
        {/* The same box as the listing dialog: max-w-md, and a max height
            that leaves room for the send button hanging below it. */}
        <div className="relative w-full max-w-md" role="dialog" aria-modal="true" aria-label={title}>
          <div className="dialog-in flex max-h-[calc(85vh-4.5rem)] w-full flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-6 py-5">
              <div className="min-w-0 flex-1">
                {onBack && <BackIconButton onClick={onBack} />}
              </div>
              <h2 className="min-w-0 truncate text-center text-lg font-semibold text-slate-900">{title}</h2>
              <div className="flex min-w-0 flex-1 justify-end">{closeButton}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </div>
          <div ref={setSendSlot} className="pointer-events-none absolute inset-x-0 top-full mt-3 flex [&>*]:pointer-events-auto" />
        </div>
      </div>
    )
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="dialog-in flex w-full max-w-xl max-h-[85vh] flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {closeButton}
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
