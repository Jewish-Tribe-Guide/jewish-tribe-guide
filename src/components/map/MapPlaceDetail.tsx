'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DirectoryResource } from '@/types'
import { resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import ListingView, { type Onward } from '@/components/resources/ListingView'
import type { SearchFound } from '@/lib/askSearch'
import ListingEditBar from '@/components/resources/ListingEditBar'
import ListingEditor from '@/components/resources/ListingEditor'
import UpButton from '@/components/UpButton'
import { ui } from '@/lib/uiConfig'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { useCommunitySlug } from '@/lib/communityContext'
import BackIconButton from '@/components/BackIconButton'

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  /** "Back to list", to the nearby list this place was picked from. Omitted
   *  by the category listing sheet, where the list is the page behind the
   *  sheet and dragging down or tapping it away is the way back. */
  onBack?: () => void
  /** What the search that opened it matched — see PlaceDetailBody's `found`. */
  found?: SearchFound | null
  /** The directory's upvote control, under the name. Upvotes rank a
   *  category's list, so only the directory's sheet passes one; the map
   *  has no list order for it to change. */
  upvote?: ReactNode
  /** Where it is, in the row's words ("Bustleton"). */
  place?: string | null
  /** The places nearby in the same category, after the listing: the
   *  category's sheet passes them; the map has its own nearby list. */
  onward?: Onward
  /** Drawn in the desktop column: see ListingView's `wide`. */
  wide?: boolean
  /** See ListingView's `onwardClassName`. */
  onwardClassName?: string
  /** See ListingView's `titleAs`. */
  titleAs?: 'h1' | 'h2'
}

/** The nearest ancestor that scrolls, i.e. the parent's scroll region. */
function scrollingAncestor(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

/**
 * Full place details shown inline in the mobile map's bottom sheet — the
 * Google-Maps-style alternative to navigating away to the category
 * directory — and, since the category list stopped expanding inline, in
 * that list's own listing sheet on a phone too (GenericListingCard), so a
 * listing reads the same wherever it's opened. Renders the same `PlaceDetailBody` the category directory's
 * expanded listing card does (hours, tags, badges, davening times, freeform
 * fields, caveat notes), read-only (no filter callbacks — the map has no
 * such filters of its own), plus its own header and back button, the same
 * FreshnessFooter line, and the same "Suggest an edit" bar and overflow the
 * directory shows, as the last thing in the content. So a place reads, and
 * can be corrected, the same whether you found it here or in the category
 * directory. The upvote shows only when the directory's sheet passes one
 * (`upvote`): upvotes rank a category's list, which the map doesn't have.
 */
export default function MapPlaceDetail({ item, category, color, onBack, found, upvote, place = null, onward, wide = false, onwardClassName, titleAs }: Props) {
  const community = useCommunitySlug()
  const listingPath = routes.listing(community, category.id, listingSlug(item))
  // Edit swaps this whole detail view for the listing-shaped editor
  // (ListingEditor), same as the desktop listing dialog —
  // scoped to this one component, since neither sheet it lives in has a
  // separate "form view" of its own to navigate to. Returns to this same place's
  // detail (not the list) on cancel or submit. Requesting a removal is part
  // of that form (see RemovalRequest), so there's no separate Report view.
  //
  // It gets its own history entry, nested on top of the one
  // MobileNearbySheet's selectPlace already pushed for this place — so a
  // swipe-back/browser-back out of the form lands on this place's detail,
  // not the list underneath it or off the map entirely. Same pattern as
  // that one; see its own comment for why (and CategoryEditor's
  // openPreview/closePreview, the precedent both follow).
  const [formOpen, setFormOpen] = useState<'edit' | null>(null)
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  // The editor's Request removal screen is a step of its own, one more
  // history entry on top of the form's — so Back and the phone's back
  // swipe step out of removal into the edit (what was typed there still
  // there), not out of editing altogether. It has no Cancel of its own.
  // Same as the desktop dialog (ListingDetailModal).
  const [removalOpen, setRemovalOpen] = useState(false)
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { mapSheetForm?: 'edit'; mapSheetRemoval?: boolean } | null
      const open = state?.mapSheetForm === 'edit' ? 'edit' : null
      setFormOpen(open)
      setRemovalOpen(open === 'edit' && !!state?.mapSheetRemoval)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const openForm = (mode: 'edit') => {
    history.pushState({ ...(window.history.state ?? {}), mapSheetForm: mode }, '')
    setFormOpen(mode)
  }
  // One step back: from removal to the edit, from the edit to the listing.
  const stepBack = () => history.back()
  // All the way out of the form — two entries back once a removal request
  // has been sent from its own screen.
  const closeForm = () => (removalOpen ? history.go(-2) : history.back())
  const changeRemovalOpen = (open: boolean) => {
    if (open === removalOpen) return
    if (open) {
      history.pushState({ ...(window.history.state ?? {}), mapSheetRemoval: true }, '')
      setRemovalOpen(true)
    } else stepBack()
  }
  // Opening or closing the form swaps everything inside the parent's scroll
  // region, and that region stays mounted, so it would keep its offset: the
  // bar is the LAST thing in the listing, so the form typically opened
  // scrolled to the bottom, its Back and title out of view. A layout effect,
  // so the wrong offset never paints.
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const region = scrollingAncestor(rootRef.current)
    if (region) region.scrollTop = 0
  }, [formOpen])
  const caps = resolveCapabilities(category.capabilities)
  const canEdit = ui.contributions.edit && caps.edit

  if (formOpen) {
    return (
      <div ref={rootRef}>
        {/* A chevron alone (BackIconButton) rather than naming a
            destination: unlike "Back to list", which really does go to a
            different screen, this returns to the same place you were
            already on. The editor's title goes
            in the middle of the same row, as it does between the desktop
            dialog's Back and Close; the empty third column keeps it
            centred. */}
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span>
            <BackIconButton onClick={stepBack} />
          </span>
          <div ref={setTitleSlot} className="min-w-0 text-center text-base" />
        </div>
        <ListingEditor
          item={item}
          category={category}
          onClose={closeForm}
          titleSlot={titleSlot}
          removalOpen={removalOpen}
          onRemovalOpenChange={changeRemovalOpen}
        />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="space-y-4 pb-2">
      {onBack && <UpButton label="Back to list" onClick={onBack} className="" />}
      <ListingView
        item={item}
        category={category}
        color={color}
        place={place}
        found={found}
        path={listingPath}
        onward={onward}
        upvote={upvote}
        wide={wide}
        onwardClassName={onwardClassName}
        titleAs={titleAs}
        foot={
          // Suggest an edit, and the ⋯ with Pin and Set as location (Share
          // has its own button up top). Rendered even without edit, for
          // those two. `stack` for the fan: there's no scrim behind it to
          // give its captions a dark ground. See ListingActionsFan's
          // `placement`.
          <ListingEditBar
            onEdit={canEdit ? () => openForm('edit') : undefined}
            item={item}
            category={category}
            path={listingPath}
            fanPlacement="stack"
            omit={['share']}
          />
        }
      />
    </div>
  )
}
