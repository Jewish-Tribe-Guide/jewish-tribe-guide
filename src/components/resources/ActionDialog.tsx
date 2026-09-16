'use client'

import { useEffect, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

type Props = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Desktop's Edit/Report — layered on top of the still-visible (dimmed)
 *  directory grid instead of replacing the whole screen with the form, the
 *  same "stay in place" reasoning as ListingDetailModal (viewing a listing)
 *  and mobile's own ReportSheet. Unlike ListingDetailModal's max-w-md — sized
 *  for a listing's own facts — this holds a real form (ListingForm/
 *  ReportListing), which needs more width for address/hours/tag inputs and
 *  more height before it needs its own internal scroll.
 *
 *  Same conventions as ListingDetailModal otherwise: backdrop click and
 *  Escape both close it, body scroll locks while open. */
export default function ActionDialog({ isOpen, onClose, title, children }: Props) {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="flex w-full max-w-xl max-h-[85vh] flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
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
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
