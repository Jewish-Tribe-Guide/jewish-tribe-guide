'use client'

import { useEffect, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import type { SearchFound } from '@/lib/askSearch'
import MapPlaceDetail from '@/components/map/MapPlaceDetail'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { OnwardSection, type Onward } from './ListingView'

// ── An opened listing on desktop ─────────────────────────────────────────────
// It takes the list's column, and the map stays beside it, centred on the
// place with its pin lit (agreed Sep 30; it used to open in a dialog over
// both). Back returns to the list where it was; ‹ › step through the list
// as it's shown, as the arrow keys do.
//
// With the map hidden, or in a category with no map at all (WhatsApp
// groups), the listing is one column under the search box, in the same
// order as everywhere, and the places nearby sit where the map would be.

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  place: string | null
  found: SearchFound | null
  upvote?: ReactNode
  onward: Onward
  /** "All 73 Food places". */
  backLabel: string
  onBack: () => void
  /** Where it is in the list as shown: "12 of 73". */
  position: { index: number; total: number }
  onStep: (direction: 1 | -1) => void
  /** The map isn't beside it: hidden, or the category has none. */
  alone: boolean
  /** Brings a hidden map back; left out where there's no map to show. */
  onShowMap?: () => void
  /** A phone that arrived from a link: the listing is the page, and the
   *  site header's back arrow goes to the list, so no bar of its own. */
  phone?: boolean
}

export default function ListingColumn({ item, category, color, place, found, upvote, onward, backLabel, onBack, position, onStep, alone, onShowMap, phone = false }: Props) {
  const hasPrev = position.index > 0
  const hasNext = position.index < position.total - 1

  // Escape goes back to the list, and ← → step through it, as they did in
  // the dialog. Not while editing (the form's own fields want the arrows),
  // and never from inside a text field.
  useEffect(() => {
    if (phone) return
    const onKey = (e: KeyboardEvent) => {
      // While editing, Escape steps back one level (out of Request removal
      // into the edit, out of the edit to the listing), as Back does.
      const state = window.history.state as { mapSheetForm?: string } | null
      if (state?.mapSheetForm) {
        if (e.key === 'Escape') window.history.back()
        return
      }
      const target = e.target as HTMLElement | null
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return
      if (e.key === 'Escape') onBack()
      else if (e.key === 'ArrowLeft' && hasPrev) onStep(-1)
      else if (e.key === 'ArrowRight' && hasNext) onStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, onStep, hasPrev, hasNext, phone])

  const step = 'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-30'

  const bar = (
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-2.5" data-testid="listing-column-bar">
      <button type="button" onClick={onBack} className="-ml-1 flex cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-[15px] font-bold text-primary hover:underline">
        <ChevronLeftIcon className="h-[18px] w-[18px]" />
        {backLabel}
      </button>
      <div className="flex items-center gap-2 text-sm text-muted">
        {onShowMap && (
          <button type="button" onClick={onShowMap} className="mr-2 h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Show map
          </button>
        )}
        <button type="button" aria-label="Previous listing" disabled={!hasPrev} onClick={() => onStep(-1)} className={step}>
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span>
          {position.index + 1} of {position.total}
        </span>
        <button type="button" aria-label="Next listing" disabled={!hasNext} onClick={() => onStep(1)} className={step}>
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  const listing = (
    <MapPlaceDetail
      item={item}
      category={category}
      color={color}
      place={place}
      found={found}
      upvote={upvote}
      onward={onward}
      wide
      // Beside the listing instead, where there's room for it.
      onwardClassName={alone ? 'lg:hidden' : ''}
    />
  )

  if (phone) {
    return (
      <section aria-label={item.name} data-testid="listing-page" className="pt-1">
        <MapPlaceDetail item={item} category={category} color={color} place={place} found={found} upvote={upvote} onward={onward} titleAs="h1" />
      </section>
    )
  }

  return (
    <section aria-label={item.name} data-testid="listing-column">
      {bar}
      {alone ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,720px)_384px] lg:justify-between lg:gap-12">
          <div className="min-w-0">{listing}</div>
          <div className="hidden lg:block">
            <div className="sticky top-[4.5rem]">
              <OnwardSection item={item} category={category} color={color} onward={onward} aside />
            </div>
          </div>
        </div>
      ) : (
        listing
      )}
    </section>
  )
}
