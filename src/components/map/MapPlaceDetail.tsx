'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { DirectoryResource } from '@/types'
import { PHOTO_FIELD_KEY, resolveCapabilities, type CategoryConfig } from '@/lib/categories'
import PlaceDetailBody from '@/components/resources/PlaceDetailBody'
import FreshnessFooter from '@/components/resources/FreshnessFooter'
import ListingEditBar from '@/components/resources/ListingEditBar'
import ListingForm from '@/components/resources/ListingForm'
import CategoryIcon from '@/components/CategoryIcon'
import PinnedBadge from '@/components/PinnedBadge'
import UpButton from '@/components/UpButton'
import { ui } from '@/lib/uiConfig'
import { routes } from '@/lib/routes'
import { listingSlug } from '@/lib/listingSlug'
import { useCommunitySlug } from '@/lib/communityContext'
import { usePinned } from '@/lib/pinnedContext'

type Props = {
  item: DirectoryResource
  category: CategoryConfig
  color: string
  onBack: () => void
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
 * directory. Renders the same `PlaceDetailBody` the category directory's
 * expanded listing card does (hours, tags, badges, davening times, freeform
 * fields, caveat notes), read-only (no filter callbacks — the map has no
 * such filters of its own), plus its own header and back button, the same
 * FreshnessFooter line, and the same "Suggest an edit" bar and overflow the
 * directory shows, as the last thing in the content. So a place reads, and
 * can be corrected, the same whether you found it here or in the category
 * directory. Still doesn't show upvote inline: that's a directory-list affordance (ranking search
 * results against each other), which doesn't mean anything for a single
 * place already selected on the map.
 */
export default function MapPlaceDetail({ item, category, color, onBack }: Props) {
  const community = useCommunitySlug()
  const listingPath = routes.listing(community, category.id, listingSlug(item))
  const { isPinned } = usePinned()
  const pinned = isPinned(item.id)
  const iconImageUrl =
    (typeof item[PHOTO_FIELD_KEY] === 'string' && (item[PHOTO_FIELD_KEY] as string).trim()
      ? (item[PHOTO_FIELD_KEY] as string)
      : category.iconImageUrl) ?? undefined
  // Edit swaps this whole detail view for the same form the category
  // directory uses (ListingForm), same as GenericListingCard's own mobile
  // accordion — scoped to this one component, since the map has no separate
  // "form view" of its own to navigate to. Returns to this same place's
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
  // Whether ListingForm has swapped to its Request removal panel — reported
  // up via onRemovalOpenChange so the h2 below can become "Request removal
  // of {name}" instead of a static "Suggest an edit". Reset alongside
  // formOpen (both directions: opening fresh, and popstate closing it) so a
  // stale `true` from a previous visit here can't leak into the next one.
  const [removalOpen, setRemovalOpen] = useState(false)
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { mapSheetForm?: 'edit' } | null
      const open = state?.mapSheetForm === 'edit' ? 'edit' : null
      setFormOpen(open)
      if (!open) setRemovalOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const openForm = (mode: 'edit') => {
    history.pushState({ ...(window.history.state ?? {}), mapSheetForm: mode }, '')
    setFormOpen(mode)
    setRemovalOpen(false)
  }
  const closeForm = () => history.back()
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
        {/* Own back affordance on BOTH platforms — not just mobile.
            `embedded` suppresses useSetScreenHeader's "‹ ..." call (never
            visible here anyway: MapScreen collapses the shared header on
            this screen so it doesn't compete with the map's own floating
            search bar) on both platforms, replaced by the same UpButton
            every other screen's "go up a level" control already is (see
            its own doc) — same as "Back to list" below, which shows on
            both platforms too, for the same reason. "Back" alone rather
            than naming a destination, since — unlike "Back to list",
            which really does go to a different screen (the nearby list)
            — this one just returns to the same place detail you were
            already on. */}
        <UpButton label="Back" onClick={closeForm} className="mb-1" />
        {/* embedded suppresses ListingForm's own heading too,
            so this stands in for it — every other edit surface
            (ActionDialog, MobileSheet) shows this same title
            in its own header; this one and ListingDetailModal's identical
            morph-in-place were the two gaps, missed initially on the
            reasoning that the form's own intro copy plus already being on
            this listing's detail gave enough context — confirmed live
            that it read as unfinished next to the other four surfaces,
            all of which keep a title. Becomes "Request removal of {name}"
            once ListingForm reports it's swapped to that panel, rather than
            a second smaller title nested inside the form for the same fact. */}
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {removalOpen ? `Request removal of ${item.name}` : 'Suggest an edit'}
        </h2>
        <ListingForm category={category} mode="edit" existing={item} onUp={closeForm} onSubmitted={closeForm} onRemovalOpenChange={setRemovalOpen} embedded />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="space-y-4 pb-2">
      <UpButton label="Back to list" onClick={onBack} className="" />

      {/* ── Header: icon, name, category, pin ────────────────────────────── */}
      <div className="flex items-start gap-3">
        {/* Same PinnedBadge GenericListingCard/NearbyList put on their own
            avatars — self-start moved to this wrapper so the badge can
            anchor to the same box without disturbing the icon's position. */}
        <span className="relative shrink-0 self-start">
          <CategoryIcon
            icon={category.icon}
            categoryId={category.id}
            iconImageUrl={iconImageUrl}
            color={color}
            className="h-12 w-12 text-2xl"
            sizePx={48}
          />
          {pinned && <PinnedBadge />}
        </span>
        {/* min-w-0 flex-1 so a long name wraps rather than pushing the row
            wider. No top padding — self-start on the icon above already puts
            its top edge flush with this block's, i.e. with the name's first
            line; a pt would reintroduce the few-pixel gap that made the two
            look unaligned. Nothing trails the name any more: Pin, Share and
            Set as location moved from a kebab here into the edit bar's
            overflow below, same as they did in the directory. */}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight text-slate-900">
            <Link href={listingPath} className="hover:underline">
              {item.name}
            </Link>
          </h2>
          <p className="text-sm text-muted">{category.label}</p>
        </div>
      </div>

      {/* This has never had a persistent collapsed-row header the way
          GenericListingCard's mobile accordion does — a showInHeader url
          field (e.g. Networking's Website link) had nowhere to show at all
          here. See the prop's own comment. */}
      <PlaceDetailBody item={item} category={category} includeHeaderUrlFields />

      <div className="pt-2 border-t border-slate-200 space-y-2">
        {/* The freshness STATUS only. Its quiet "Suggest a correction" link
            is gone — it was the map's one visible way in to Edit while Edit
            lived in the kebab, and it sat at the same weight as the
            timestamp beside it. The bar below is that way in now, as it is
            on both directory surfaces. */}
        <FreshnessFooter resourceId={item.id} confirmedAt={item.confirmedAt} />
      </div>

      {/* The last thing in the content, the way it closes the directory's
          dropdown: part of the listing, seen whenever you've scrolled to the
          end of it. Phase 3 docked it to the panel's bottom edge instead,
          always on screen; that read as a toolbar bolted onto the map rather
          than part of the place, and it was the one surface where the bar
          wasn't where the directory puts it. A tap on it inside the mobile
          sheet's content region is safe for the same reason Directions and
          Call already are: a touch that doesn't move never becomes a sheet
          drag, and the region doesn't capture the pointer.
          Rendered even without edit: the overflow is the only home Pin,
          Share and Set as location have here. `stack` for the overflow
          because the captions need a dark ground, and there's no scrim here
          to give them one — see ListingActionsFan's `placement`. */}
      <ListingEditBar
        onEdit={canEdit ? () => openForm('edit') : undefined}
        item={item}
        category={category}
        path={listingPath}
        fanPlacement="stack"
        className="mt-1"
      />
    </div>
  )
}
