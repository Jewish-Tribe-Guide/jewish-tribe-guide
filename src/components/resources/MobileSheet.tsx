'use client'

import { useEffect, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

type Props = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Mobile's shared bottom-sheet shell — a fixed-height panel (not
 *  MobileNearbySheet's drag-to-resize machinery: that one earns the extra
 *  complexity because it has a map underneath worth trading space with;
 *  everywhere else, a single form is the whole interaction, so open/dismiss
 *  via backdrop tap, Escape, or the header close button is enough) sliding
 *  up over the still-visible (dimmed) screen underneath. Used by ReportSheet
 *  (its original, only caller) and by FindResources' own mobile Edit/Report,
 *  which used to be a flat full-screen overlay before the map's own
 *  in-sheet Edit made the mismatch obvious — see FindResources' own doc. */
export default function MobileSheet({ isOpen, onClose, title, children }: Props) {
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
        aria-label={title}
      >
        {/* A drag handle would promise a drag gesture this sheet doesn't
            have (see this component's own doc) — a plain header with a
            real close button instead, same affordance ListingDetailModal
            and ActionDialog give desktop. */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
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
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
